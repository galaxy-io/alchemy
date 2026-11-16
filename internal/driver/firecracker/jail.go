package firecracker

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

// Every microVM runs under Firecracker's jailer: chrooted into its own
// directory, in its own cgroup, as its own unprivileged uid. An escaped
// guest lands in a process that can see only its own kernel and rootfs and
// cannot signal or read any other microVM.
//
// The jailer creates <DataDir>/jail/firecracker/<id>/root and runs
// Firecracker inside it, so every file Firecracker opens is hard-linked into
// that root first. Hard links cannot cross filesystems, which is why the
// kernel, the rootfs cache and the jails all live under one DataDir.

const (
	// cgroupRoot is where the cgroup v2 hierarchy is mounted.
	cgroupRoot = "/sys/fs/cgroup"
	// uidRange is how many uids, from Config.UIDBase, microVMs are given.
	uidRange = 65536
)

// uids hands each running microVM a uid no other one holds.
type uids struct {
	mu    sync.Mutex
	base  int
	next  int
	inUse map[int]bool
}

func newUIDs(base int) *uids {
	return &uids{base: base, inUse: make(map[int]bool)}
}

func (u *uids) take() (int, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	for range uidRange {
		uid := u.base + u.next
		u.next = (u.next + 1) % uidRange
		if !u.inUse[uid] {
			u.inUse[uid] = true
			return uid, nil
		}
	}
	return 0, fmt.Errorf("all %d microVM uids are in use", uidRange)
}

func (u *uids) give(uid int) {
	u.mu.Lock()
	defer u.mu.Unlock()
	delete(u.inUse, uid)
}

// setupCgroups prepares the cgroup the jailer puts each microVM under, and
// returns its path relative to cgroupRoot.
//
// cgroup v2 lets a cgroup either hold processes or hand controllers to its
// children, not both. The host starts in a cgroup of its own (its container,
// or a systemd scope) holding its processes, so it first moves them into a
// "host" child, then enables the cpu controller and creates the "vms" child
// the microVMs' cgroups go under.
func setupCgroups() (string, error) {
	if _, err := os.Stat(filepath.Join(cgroupRoot, "cgroup.controllers")); err != nil {
		return "", fmt.Errorf("cgroup v2 is not mounted at %s: %w", cgroupRoot, err)
	}
	rel, err := selfCgroup()
	if err != nil {
		return "", err
	}
	self := filepath.Join(cgroupRoot, rel)
	controllers, err := os.ReadFile(filepath.Join(self, "cgroup.controllers"))
	if err != nil {
		return "", err
	}
	if !strings.Contains(" "+strings.TrimSpace(string(controllers))+" ", " cpu ") {
		return "", fmt.Errorf("the cpu controller is not available in %s; the host needs a cgroup with cpu delegated to it", self)
	}

	leaf := filepath.Join(self, "host")
	if err := os.MkdirAll(leaf, 0o755); err != nil { //nolint:gosec // cgroup directories are world-readable
		return "", err
	}
	procs, err := os.ReadFile(filepath.Join(self, "cgroup.procs"))
	if err != nil {
		return "", err
	}
	for pid := range strings.FieldsSeq(string(procs)) {
		// A process may exit between the read and the move.
		if err := os.WriteFile(filepath.Join(leaf, "cgroup.procs"), []byte(pid), 0); err != nil && !errors.Is(err, syscall.ESRCH) {
			return "", fmt.Errorf("move process %s into %s: %w", pid, leaf, err)
		}
	}

	vms := filepath.Join(self, "vms")
	if err := enableCPU(self); err != nil {
		return "", err
	}
	if err := os.MkdirAll(vms, 0o755); err != nil { //nolint:gosec // cgroup directories are world-readable
		return "", err
	}
	if err := enableCPU(vms); err != nil {
		return "", err
	}
	return strings.TrimPrefix(filepath.Join(rel, "vms"), "/"), nil
}

// killMicroVMs SIGKILLs every firecracker process whose real uid is in
// [base, base+n), and returns how many it signalled.
func killMicroVMs(base, n int) int {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return 0
	}
	killed := 0
	for _, e := range entries {
		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue
		}
		status, err := os.ReadFile("/proc/" + e.Name() + "/status")
		if err != nil {
			continue
		}
		var name string
		uid := -1
		for line := range strings.Lines(string(status)) {
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}
			switch fields[0] {
			case "Name:":
				name = fields[1]
			case "Uid:":
				uid, _ = strconv.Atoi(fields[1])
			}
		}
		if name == "firecracker" && uid >= base && uid < base+n && syscall.Kill(pid, syscall.SIGKILL) == nil {
			killed++
		}
	}
	return killed
}

// enableCPU hands the cpu controller to dir's children.
func enableCPU(dir string) error {
	if err := os.WriteFile(filepath.Join(dir, "cgroup.subtree_control"), []byte("+cpu"), 0); err != nil {
		return fmt.Errorf("enable cpu in %s: %w", dir, err)
	}
	return nil
}

// selfCgroup is this process's cgroup v2 path, from /proc/self/cgroup.
func selfCgroup() (string, error) {
	raw, err := os.ReadFile("/proc/self/cgroup")
	if err != nil {
		return "", err
	}
	sc := bufio.NewScanner(bytes.NewReader(raw))
	for sc.Scan() {
		if rel, ok := strings.CutPrefix(sc.Text(), "0::"); ok {
			return rel, nil
		}
	}
	return "", errors.New("no cgroup v2 entry in /proc/self/cgroup")
}

// jail is one microVM's jailer directory.
type jail struct {
	// dir is <DataDir>/jail/firecracker/<id>; Firecracker's log is kept here,
	// outside the chroot.
	dir string
	// root is the chroot. Paths Firecracker is given are relative to it.
	root string
}

// newJail creates the chroot ahead of the jailer, owned by uid, and
// hard-links the kernel and every file in links, host path to chroot path,
// into it. The jail is returned even on error, so the caller can remove
// what was made.
func (d *Driver) newJail(id string, uid int, links map[string]string) (*jail, error) {
	j := &jail{dir: filepath.Join(d.cfg.DataDir, "jail", jailExec, id)}
	j.root = filepath.Join(j.dir, "root")
	if err := os.MkdirAll(j.root, 0o700); err != nil {
		return j, err
	}
	if err := os.Chown(j.root, uid, uid); err != nil {
		return j, err
	}
	links[d.kernel()] = jailKernel
	for src, dst := range links {
		if err := os.Link(src, j.host(dst)); err != nil {
			return j, fmt.Errorf("link %s into jail: %w", src, err)
		}
	}
	return j, nil
}

// host turns a path inside the chroot into the path the host sees.
func (j *jail) host(path string) string { return filepath.Join(j.root, path) }

// cgroup is the jailer's cgroup for this microVM, removed on release: the
// jailer creates it but never cleans it up.
func (d *Driver) cgroup(id string) string {
	return filepath.Join(cgroupRoot, d.parentCgroup, id)
}

// jailerArgs runs Firecracker for id inside its jail, limited to vcpus CPUs,
// and in net's namespace when it has one.
func (d *Driver) jailerArgs(id string, uid int, vcpus uint32, net *vmNet) []string {
	args := []string{
		"--id", id,
		"--exec-file", d.firecracker(),
		"--uid", strconv.Itoa(uid),
		"--gid", strconv.Itoa(uid),
		"--chroot-base-dir", filepath.Join(d.cfg.DataDir, "jail"),
		"--cgroup-version", "2",
		"--parent-cgroup", d.parentCgroup,
		"--cgroup", fmt.Sprintf("cpu.max=%d 100000", max(vcpus, 1)*100000),
		"--",
		"--api-sock", jailAPISocket,
	}
	if net != nil {
		args = append([]string{"--netns", net.path()}, args...)
	}
	return args
}

// jailExec names the Firecracker binary the jailer runs, and so the
// directory every jail sits in.
const jailExec = "firecracker"

// Paths inside every chroot.
const (
	jailAPISocket = "/api.sock"
	jailVsock     = "/v.sock"
	jailKernel    = "/vmlinux"
	jailRootfs    = "/rootfs.ext4"
	jailLayers    = "/layers.ext4"
	// A restore reads the snapshot from here; a snapshot is written here
	// by Firecracker, which can only write inside its jail.
	jailVMState = "/vmstate"
	jailMemory  = "/mem"
)
