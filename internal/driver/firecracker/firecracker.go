// Package firecracker runs each instance as a Firecracker microVM: one
// process per microVM, configured over its API socket, with the function's
// image as a read-only root filesystem and the supervisor as the guest's
// init. Every microVM runs under the jailer (see jail.go). Linux with
// /dev/kvm and cgroup v2 only, run as root.
//
// An artifact with a snapshot (see snapshot.go) is restored on Acquire;
// any other is booted from its kernel.
package firecracker

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/go-containerregistry/pkg/authn"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
	"github.com/galaxy-io/alchemy/api/supervisor/v1/supervisorv1connect"
	"github.com/galaxy-io/alchemy/internal/driver"
)

const (
	guestCID       = 3
	supervisorPort = 1024
	bootTimeout    = 30 * time.Second
)

// Config locates the host-side pieces the driver needs.
type Config struct {
	// FirecrackerBin is the firecracker executable.
	FirecrackerBin string
	// JailerBin is the jailer from the same Firecracker release.
	JailerBin string
	// Kernel is an uncompressed guest kernel (vmlinux on x86_64, Image on
	// aarch64) built with Firecracker's guest config. It is copied into
	// DataDir at start.
	Kernel string
	// SupervisorBin is a static Linux build of cmd/supervisor for the guest
	// architecture. It is copied into every rootfs.
	SupervisorBin string
	// DataDir holds the kernel, built rootfs images keyed by image digest,
	// and one jail per running microVM. It must be one filesystem, since
	// jails hard-link the kernel and rootfs.
	DataDir string
	// UIDBase is the first of the uids microVMs run as, one each. It sits
	// above the subordinate uid ranges rootless containers use.
	UIDBase int
	// Console keeps the guest's serial console on and logs it. It makes
	// boots observable and slower.
	Console bool
	// Keychain finds credentials for pulling function images.
	Keychain authn.Keychain
	// Snapshots takes a snapshot of every artifact after its build and
	// restores it on Acquire, instead of booting a kernel each time.
	Snapshots bool
}

// Driver implements driver.Driver with Firecracker microVMs.
type Driver struct {
	cfg  Config
	log  *slog.Logger
	uids *uids
	// parentCgroup is where the jailer creates each microVM's cgroup,
	// relative to cgroupRoot.
	parentCgroup string
	// generation names the snapshot cache for this Firecracker, kernel and
	// supervisor, which a snapshot is only good for.
	generation string
	// supervisorID names the supervisor build inside every root filesystem
	// this driver makes, so a new supervisor means new drives.
	supervisorID string
}

// New checks that the host runs as root with KVM usable and the configured
// binaries and kernel present, prepares DataDir, and sets up the cgroup the
// microVMs go under.
func New(cfg Config, log *slog.Logger) (*Driver, error) {
	if os.Geteuid() != 0 {
		return nil, errors.New("the host must run as root: the jailer chroots, sets up cgroups and drops each microVM to its own uid")
	}
	kvm, err := os.OpenFile("/dev/kvm", os.O_RDWR, 0)
	if err != nil {
		return nil, fmt.Errorf("kvm: %w (firecracker needs read-write access to /dev/kvm)", err)
	}
	_ = kvm.Close()
	for name, path := range map[string]string{"firecracker": cfg.FirecrackerBin, "jailer": cfg.JailerBin, "kernel": cfg.Kernel, "supervisor": cfg.SupervisorBin} {
		if _, err := os.Stat(path); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
	}

	d := &Driver{cfg: cfg, log: log, uids: newUIDs(cfg.UIDBase)}
	// A microVM a previous run left behind would share a uid with the next
	// one handed out.
	if n := killMicroVMs(cfg.UIDBase, uidRange); n > 0 {
		log.Warn("killed microVMs a previous run left", "processes", n)
	}
	// Jails left by a previous run belong to microVMs that are gone.
	if err := os.RemoveAll(filepath.Join(cfg.DataDir, "jail")); err != nil {
		return nil, err
	}
	if d.generation, err = snapshotGeneration(cfg); err != nil {
		return nil, fmt.Errorf("snapshot generation: %w", err)
	}
	if d.supervisorID, err = fileID(cfg.SupervisorBin); err != nil {
		return nil, fmt.Errorf("supervisor: %w", err)
	}
	for _, dir := range []string{d.rootfsDir(), d.layersDir(), d.snapshotsDir(), filepath.Join(cfg.DataDir, "jail")} {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, err
		}
	}
	if err := d.dropStaleSnapshots(); err != nil {
		return nil, err
	}
	if err := d.dropStaleRootfs(); err != nil {
		return nil, err
	}
	if err := dropPartial(d.layersDir(), d.snapshotsDir()); err != nil {
		return nil, err
	}
	if err := installFile(cfg.Kernel, d.kernel(), 0o444); err != nil {
		return nil, fmt.Errorf("copy kernel into %s: %w", cfg.DataDir, err)
	}
	if err := installFile(cfg.FirecrackerBin, d.firecracker(), 0o555); err != nil { //nolint:gosec // run by the jailer as each microVM's uid
		return nil, fmt.Errorf("copy firecracker into %s: %w", cfg.DataDir, err)
	}
	if d.parentCgroup, err = setupCgroups(); err != nil {
		return nil, fmt.Errorf("cgroups: %w", err)
	}
	return d, nil
}

// kernel is the copy of the guest kernel jails link to.
func (d *Driver) kernel() string { return filepath.Join(d.cfg.DataDir, "vmlinux") }

// firecracker is the copy of Firecracker the jailer runs. The jailer names
// each jail's directory after its --exec-file, so a fixed name here fixes
// the jail layout whatever the operator's binary is called.
func (d *Driver) firecracker() string { return filepath.Join(d.cfg.DataDir, jailExec) }

// rootfsDir holds built root filesystems, keyed by image digest.
func (d *Driver) rootfsDir() string { return filepath.Join(d.cfg.DataDir, "rootfs") }

// layersDir holds built layer drives, keyed by the layers' digests.
func (d *Driver) layersDir() string { return filepath.Join(d.cfg.DataDir, "layers") }

// installFile copies src to dst with mode, which no microVM uid may write.
// The copy is renamed into place, so an interrupted one never leaves a
// partial file at dst.
func installFile(src, dst string, mode os.FileMode) error {
	tmp := dst + ".tmp"
	if err := copyFile(src, tmp, mode); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dst)
}

// Acquire returns a microVM for a ready for one invocation: a's snapshot
// restored when it has one, otherwise a fresh boot. A restore that fails
// is logged and the microVM boots instead, so a stale snapshot costs time,
// not the invocation.
func (d *Driver) Acquire(ctx context.Context, a *driver.Artifact) (driver.Instance, functionsv1.StartKind, error) {
	none := functionsv1.StartKind_START_KIND_UNSPECIFIED
	if snap := d.snapshotPath(a); snap != "" {
		sb, err := d.start(ctx, a, map[string]string{
			filepath.Join(snap, "vmstate"): jailVMState,
			filepath.Join(snap, "mem"):     jailMemory,
		}, (*instance).restore)
		if err == nil {
			return sb, functionsv1.StartKind_START_KIND_SNAPSHOT_RESTORE, nil
		}
		d.log.Warn("restore failed, booting instead", "artifact_id", a.ID, "err", err)
	}
	sb, err := d.start(ctx, a, nil, (*instance).boot)
	if err != nil {
		return nil, none, err
	}
	return sb, functionsv1.StartKind_START_KIND_COLD_BOOT, nil
}

// start makes a jail with a's drives and extra links in it, and brings the
// microVM up with bring, which boots or restores. On error the jail is gone.
func (d *Driver) start(ctx context.Context, a *driver.Artifact, extra map[string]string, bring func(*instance, context.Context, *driver.Artifact) error) (*instance, error) {
	raw := make([]byte, 8)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	uid, err := d.uids.take()
	if err != nil {
		return nil, err
	}
	links := map[string]string{d.rootfsPath(a.Digest): jailRootfs}
	if layers := d.layersPath(a.Layers); layers != "" {
		links[layers] = jailLayers
	}
	maps.Copy(links, extra)
	sb := &instance{driver: d, id: hex.EncodeToString(raw), uid: uid}
	if sb.jail, err = d.newJail(sb.id, uid, links); err != nil {
		sb.Release(context.WithoutCancel(ctx))
		return nil, err
	}
	// Launching, configuring and starting the microVM share one deadline:
	// callers such as an invocation's Acquire may pass a context with none.
	bringCtx, cancel := context.WithTimeout(ctx, bootTimeout)
	defer cancel()
	if err := bring(sb, bringCtx, a); err != nil {
		sb.Release(context.WithoutCancel(ctx))
		return nil, err
	}
	return sb, nil
}

type instance struct {
	driver    *Driver
	id        string
	uid       int
	jail      *jail
	process   *exec.Cmd
	transport *http.Transport
	client    supervisorv1connect.SupervisorServiceClient
	// exited is closed once the jailer process has been waited on, with
	// its exit in waitErr. It is nil until the process starts.
	exited  chan struct{}
	waitErr error
	// keepDir preserves the jail's log on Release, for post-mortems.
	keepDir bool
}

// launch starts Firecracker in its jail and waits for its API socket.
func (s *instance) launch(ctx context.Context, a *driver.Artifact) (*api, error) {
	logFile, err := os.Create(s.logPath())
	if err != nil {
		return nil, err
	}
	defer func() { _ = logFile.Close() }()
	// Without --daemonize the jailer execs into Firecracker, so this process
	// is the microVM's for the rest of its life.
	s.process = exec.Command(s.driver.cfg.JailerBin, s.driver.jailerArgs(s.id, s.uid, a.VCPUs)...) //nolint:gosec // the binary path is operator configuration
	s.process.Stdout = logFile
	s.process.Stderr = logFile
	if err := s.process.Start(); err != nil {
		return nil, fmt.Errorf("start jailer: %w", err)
	}
	s.exited = make(chan struct{})
	go func() {
		s.waitErr = s.process.Wait()
		close(s.exited)
	}()
	apiSock := s.jail.host(jailAPISocket)
	if err := s.waitForSocket(ctx, apiSock); err != nil {
		return nil, s.failed(fmt.Errorf("api socket: %w", err))
	}
	return newAPI(apiSock), nil
}

// boot configures the microVM, starts it, waits for the supervisor to
// accept on vsock, and calls Start.
func (s *instance) boot(ctx context.Context, a *driver.Artifact) error {
	fc, err := s.launch(ctx, a)
	if err != nil {
		return err
	}
	bootArgs := "reboot=k panic=1 root=/dev/vda ro init=" + supervisorPath
	if s.driver.cfg.Console {
		bootArgs = "console=ttyS0 " + bootArgs
		if runtime.GOARCH == "arm64" {
			bootArgs = "keep_bootcon " + bootArgs
		}
	} else {
		// No serial device at all, as Firecracker recommends for production;
		// it also shaves the UART probe off the boot.
		bootArgs = "8250.nr_uarts=0 " + bootArgs
	}
	steps := []struct {
		path string
		body any
	}{
		{"/boot-source", map[string]any{"kernel_image_path": jailKernel, "boot_args": bootArgs}},
		{"/drives/rootfs", map[string]any{"drive_id": "rootfs", "path_on_host": jailRootfs, "is_root_device": true, "is_read_only": true}},
	}
	// The layer drive is the second one, /dev/vdb in the guest, where init
	// looks for it.
	if len(a.Layers) > 0 {
		steps = append(steps, struct {
			path string
			body any
		}{"/drives/layers", map[string]any{"drive_id": "layers", "path_on_host": jailLayers, "is_root_device": false, "is_read_only": true}})
	}
	steps = append(steps, []struct {
		path string
		body any
	}{
		{"/machine-config", map[string]any{"vcpu_count": a.VCPUs, "mem_size_mib": a.MemoryMiB}},
		{"/vsock", map[string]any{"guest_cid": guestCID, "uds_path": jailVsock}},
		// virtio-rng: without it the guest's RNG takes seconds to seed and
		// anything that calls getrandom early (OpenSSL, Node) blocks.
		{"/entropy", map[string]any{}},
		{"/actions", map[string]any{"action_type": "InstanceStart"}},
	}...)
	for _, step := range steps {
		if err := fc.put(ctx, step.path, step.body); err != nil {
			return s.failed(err)
		}
	}

	if err := s.connect(ctx); err != nil {
		return err
	}
	if _, err := s.client.Start(ctx, connect.NewRequest(a.StartRequest())); err != nil {
		return s.failed(fmt.Errorf("supervisor start: %w", err))
	}
	return nil
}

// restore loads the snapshot linked into the jail and resumes the microVM,
// which comes back with the supervisor started and listening.
func (s *instance) restore(ctx context.Context, a *driver.Artifact) error {
	fc, err := s.launch(ctx, a)
	if err != nil {
		return err
	}
	if err := fc.put(ctx, "/snapshot/load", map[string]any{
		"snapshot_path": jailVMState,
		"mem_backend":   map[string]any{"backend_type": "File", "backend_path": jailMemory},
		"resume_vm":     true,
	}); err != nil {
		return s.failed(err)
	}
	return s.connect(ctx)
}

// connect waits for the supervisor to accept on vsock and makes its client.
func (s *instance) connect(ctx context.Context) error {
	vsockPath := s.jail.host(jailVsock)
	if err := waitForGuest(ctx, vsockPath, supervisorPort, s.exited); err != nil {
		if errors.Is(err, errExited) {
			err = s.exitedErr()
		}
		return s.failed(fmt.Errorf("supervisor did not come up: %w", err))
	}
	s.transport = &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialVsock(ctx, vsockPath, supervisorPort)
		},
	}
	s.client = supervisorv1connect.NewSupervisorServiceClient(&http.Client{Transport: s.transport}, "http://supervisor",
		// The guest runs the function as root, so a function that takes over
		// the supervisor could send any size; this bounds what the host reads.
		connect.WithReadMaxBytes(maxSupervisorMessage))
	return nil
}

// maxSupervisorMessage is the largest message the host reads from a
// supervisor: the supervisor's 64 MiB cap on a function's output, with room
// for the rest of the result.
const maxSupervisorMessage = 64<<20 + 1<<20

// exitedErr describes the jailer's exit once exited is closed.
func (s *instance) exitedErr() error {
	if s.waitErr != nil {
		return fmt.Errorf("firecracker exited: %w", s.waitErr)
	}
	return errors.New("firecracker exited")
}

// logPath is Firecracker's output, kept beside the chroot so the guest
// cannot reach it.
func (s *instance) logPath() string { return filepath.Join(s.jail.dir, "firecracker.log") }

// failed keeps the jail and appends the console tail to err so a boot
// failure can be diagnosed from the API error alone.
func (s *instance) failed(err error) error {
	s.keepDir = true
	if raw, readErr := os.ReadFile(s.logPath()); readErr == nil {
		lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
		if len(lines) > 8 {
			lines = lines[len(lines)-8:]
		}
		return fmt.Errorf("%w; log %s ends:\n%s", err, s.jail.dir, strings.Join(lines, "\n"))
	}
	return err
}

func (s *instance) ID() string { return s.id }

func (s *instance) Invoke(ctx context.Context, req *supervisorv1.InvokeRequest, logs io.Writer) (*supervisorv1.InvokeResult, error) {
	stream, err := s.client.Invoke(ctx, connect.NewRequest(req))
	if err != nil {
		return nil, err
	}
	defer func() { _ = stream.Close() }()
	for stream.Receive() {
		switch ev := stream.Msg().GetEvent().(type) {
		case *supervisorv1.InvokeResponse_Log:
			if _, err := logs.Write(ev.Log); err != nil {
				return nil, fmt.Errorf("write logs: %w", err)
			}
		case *supervisorv1.InvokeResponse_Result:
			return ev.Result, nil
		}
	}
	if err := stream.Err(); err != nil {
		return nil, err
	}
	return nil, errors.New("supervisor ended the invocation without a result")
}

// Release kills the microVM. The rootfs is read-only and shared, so there is
// nothing to flush; killing the process is the fastest teardown. Then the
// cgroup, the jail and the uid go.
func (s *instance) Release(context.Context) {
	log := s.driver.log.With("instance_id", s.ID())
	if s.transport != nil {
		s.transport.CloseIdleConnections()
	}
	if s.exited != nil {
		_ = s.process.Process.Kill()
		<-s.exited
		if err := os.Remove(s.driver.cgroup(s.id)); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Warn("remove cgroup", "err", err)
		}
	}
	s.driver.uids.give(s.uid)
	// A failed microVM keeps its log, beside the chroot. The chroot goes
	// either way: it holds hard links to the memory file, the rootfs and
	// the layers, which would keep them on disk after Forget.
	dir := s.jail.dir
	if s.keepDir {
		dir = s.jail.root
		log.Warn("keeping jail log for inspection", "log", s.logPath())
	}
	if err := os.RemoveAll(dir); err != nil {
		log.Warn("remove jail", "dir", dir, "err", err)
	}
}

// Info reports the Firecracker version, the kernel, and the drive cache:
// the images it holds, and the bytes of their root filesystems and of the
// layer drives.
func (d *Driver) Info(ctx context.Context) driver.HostInfo {
	info := driver.HostInfo{Kernel: d.cfg.Kernel}
	if out, err := exec.CommandContext(ctx, d.cfg.FirecrackerBin, "--version").Output(); err == nil { //nolint:gosec // operator-configured path
		info.FirecrackerVersion = strings.TrimSpace(strings.SplitN(string(out), "\n", 2)[0])
	}
	for _, dir := range []string{d.rootfsDir(), d.layersDir()} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if fi, err := e.Info(); err == nil && !fi.IsDir() && strings.HasSuffix(e.Name(), ".ext4") {
				info.RootfsCacheBytes += fi.Size()
				if dir == d.rootfsDir() {
					info.RootfsCacheImages++
				}
			}
		}
	}
	return info
}

// waitForSocket returns once something accepts connections on the Unix
// socket at path, or fails once the jailer exits. The socket file appears
// before Firecracker listens on it, so checking for the file alone races
// under load.
func (s *instance) waitForSocket(ctx context.Context, path string) error {
	err := waitForSocket(ctx, path, s.exited)
	if errors.Is(err, errExited) {
		return s.exitedErr()
	}
	return err
}

// errExited is returned by the wait loops when the process they wait on
// exits first.
var errExited = errors.New("process exited")

func waitForSocket(ctx context.Context, path string, exited <-chan struct{}) error {
	tick := time.NewTicker(time.Millisecond)
	defer tick.Stop()
	for {
		if conn, err := net.Dial("unix", path); err == nil {
			return conn.Close()
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-exited:
			return errExited
		case <-tick.C:
		}
	}
}
