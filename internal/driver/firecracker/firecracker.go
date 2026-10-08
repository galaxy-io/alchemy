// Package firecracker runs each instance as a Firecracker microVM: one
// process per microVM, configured over its API socket, with the function's
// image as a read-only root filesystem and the supervisor as the guest's
// init. Linux with /dev/kvm only.
//
// This is the cold-boot path: every Acquire boots a kernel. No jailer and no
// snapshots yet.
package firecracker

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"connectrpc.com/connect"

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
	// Kernel is an uncompressed guest kernel (vmlinux on x86_64, Image on
	// aarch64) built with Firecracker's guest config.
	Kernel string
	// SupervisorBin is a static Linux build of cmd/supervisor for the guest
	// architecture. It is copied into every rootfs.
	SupervisorBin string
	// CacheDir holds built rootfs images, keyed by image digest.
	CacheDir string
	// RunDir holds one directory per running microVM: API socket, vsock
	// socket, console log.
	RunDir string
	// Console keeps the guest's serial console on and logs it. It makes
	// boots observable and slower.
	Console bool
}

// Driver implements driver.Driver with Firecracker microVMs.
type Driver struct {
	cfg Config
	log *slog.Logger
}

// New checks that the configured binaries and kernel exist and prepares the
// cache and run directories.
func New(cfg Config, log *slog.Logger) (*Driver, error) {
	for name, path := range map[string]string{"firecracker": cfg.FirecrackerBin, "kernel": cfg.Kernel, "supervisor": cfg.SupervisorBin} {
		if _, err := os.Stat(path); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
	}
	for _, dir := range []string{cfg.CacheDir, cfg.RunDir} {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, err
		}
	}
	return &Driver{cfg: cfg, log: log}, nil
}

// Acquire boots a fresh microVM for a and returns it ready for one
// invocation.
func (d *Driver) Acquire(ctx context.Context, a *driver.Artifact) (driver.Instance, functionsv1.StartKind, error) {
	none := functionsv1.StartKind_START_KIND_UNSPECIFIED

	raw := make([]byte, 8)
	if _, err := rand.Read(raw); err != nil {
		return nil, none, err
	}
	sb := &instance{driver: d, id: hex.EncodeToString(raw)}
	sb.dir = filepath.Join(d.cfg.RunDir, sb.id)
	if err := os.Mkdir(sb.dir, 0o750); err != nil {
		return nil, none, err
	}

	if err := sb.boot(ctx, a); err != nil {
		sb.Release(context.WithoutCancel(ctx))
		return nil, none, err
	}
	return sb, functionsv1.StartKind_START_KIND_COLD_BOOT, nil
}

type instance struct {
	driver    *Driver
	id        string
	dir       string
	process   *exec.Cmd
	transport *http.Transport
	client    supervisorv1connect.SupervisorServiceClient
	// keepDir preserves the run directory on Release, for post-mortems.
	keepDir bool
}

// boot starts a Firecracker process, configures the microVM, starts it, and
// waits for the supervisor to accept on vsock.
func (s *instance) boot(ctx context.Context, a *driver.Artifact) error {
	apiSock := filepath.Join(s.dir, "api.sock")
	vsockPath := filepath.Join(s.dir, "v.sock")

	logFile, err := os.Create(filepath.Join(s.dir, "firecracker.log"))
	if err != nil {
		return err
	}
	defer func() { _ = logFile.Close() }()
	s.process = exec.Command(s.driver.cfg.FirecrackerBin, "--api-sock", apiSock) //nolint:gosec // the binary path is operator configuration
	s.process.Stdout = logFile
	s.process.Stderr = logFile
	if err := s.process.Start(); err != nil {
		return fmt.Errorf("start firecracker: %w", err)
	}
	if err := waitForSocket(ctx, apiSock); err != nil {
		return s.failed(fmt.Errorf("api socket: %w", err))
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
	fc := newAPI(apiSock)
	steps := []struct {
		path string
		body any
	}{
		{"/boot-source", map[string]any{"kernel_image_path": s.driver.cfg.Kernel, "boot_args": bootArgs}},
		{"/drives/rootfs", map[string]any{"drive_id": "rootfs", "path_on_host": a.Image, "is_root_device": true, "is_read_only": true}},
		{"/machine-config", map[string]any{"vcpu_count": a.VCPUs, "mem_size_mib": a.MemoryMiB}},
		{"/vsock", map[string]any{"guest_cid": guestCID, "uds_path": vsockPath}},
		// virtio-rng: without it the guest's RNG takes seconds to seed and
		// anything that calls getrandom early (OpenSSL, Node) blocks.
		{"/entropy", map[string]any{}},
		{"/actions", map[string]any{"action_type": "InstanceStart"}},
	}
	for _, step := range steps {
		if err := fc.put(ctx, step.path, step.body); err != nil {
			return s.failed(err)
		}
	}

	bootCtx, cancel := context.WithTimeout(ctx, bootTimeout)
	defer cancel()
	if err := waitForGuest(bootCtx, vsockPath, supervisorPort); err != nil {
		return s.failed(fmt.Errorf("supervisor did not come up: %w", err))
	}

	s.transport = &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialVsock(ctx, vsockPath, supervisorPort)
		},
	}
	s.client = supervisorv1connect.NewSupervisorServiceClient(&http.Client{Transport: s.transport}, "http://supervisor")
	if _, err := s.client.Start(bootCtx, connect.NewRequest(a.StartRequest())); err != nil {
		return s.failed(fmt.Errorf("supervisor start: %w", err))
	}
	return nil
}

// failed keeps the run directory and appends the console tail to err so a
// boot failure can be diagnosed from the API error alone.
func (s *instance) failed(err error) error {
	s.keepDir = true
	if raw, readErr := os.ReadFile(filepath.Join(s.dir, "firecracker.log")); readErr == nil {
		lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
		if len(lines) > 8 {
			lines = lines[len(lines)-8:]
		}
		return fmt.Errorf("%w; log %s ends:\n%s", err, s.dir, strings.Join(lines, "\n"))
	}
	return err
}

func (s *instance) ID() string { return s.id }

func (s *instance) Invoke(ctx context.Context, req *supervisorv1.InvokeRequest) (*supervisorv1.InvokeResponse, error) {
	resp, err := s.client.Invoke(ctx, connect.NewRequest(req))
	if err != nil {
		return nil, err
	}
	return resp.Msg, nil
}

// Release kills the microVM. The rootfs is read-only and shared, so there is
// nothing to flush; killing the process is the fastest teardown.
func (s *instance) Release(context.Context) {
	if s.transport != nil {
		s.transport.CloseIdleConnections()
	}
	if s.process != nil && s.process.Process != nil {
		_ = s.process.Process.Kill()
		_ = s.process.Wait()
	}
	if s.keepDir {
		s.driver.log.Warn("keeping instance dir for inspection", "dir", s.dir)
		return
	}
	if err := os.RemoveAll(s.dir); err != nil {
		s.driver.log.Warn("remove instance dir", "dir", s.dir, "err", err)
	}
}

// Info reports the Firecracker version, the kernel, and the rootfs cache.
func (d *Driver) Info(ctx context.Context) driver.HostInfo {
	info := driver.HostInfo{Kernel: d.cfg.Kernel}
	if out, err := exec.CommandContext(ctx, d.cfg.FirecrackerBin, "--version").Output(); err == nil { //nolint:gosec // operator-configured path
		info.FirecrackerVersion = strings.TrimSpace(strings.SplitN(string(out), "\n", 2)[0])
	}
	if entries, err := os.ReadDir(filepath.Join(d.cfg.CacheDir, "rootfs")); err == nil {
		for _, e := range entries {
			if fi, err := e.Info(); err == nil && !fi.IsDir() && strings.HasSuffix(e.Name(), ".ext4") {
				info.RootfsCacheBytes += fi.Size()
				info.RootfsCacheImages++
			}
		}
	}
	return info
}

// waitForSocket returns once something accepts connections on the Unix
// socket at path. The socket file appears before Firecracker listens on it,
// so checking for the file alone races under load.
func waitForSocket(ctx context.Context, path string) error {
	tick := time.NewTicker(time.Millisecond)
	defer tick.Stop()
	for {
		if conn, err := net.Dial("unix", path); err == nil {
			return conn.Close()
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-tick.C:
		}
	}
}
