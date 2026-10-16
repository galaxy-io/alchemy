package main

import (
	"fmt"
	"net"
	"os"

	"github.com/mdlayher/vsock"
	"golang.org/x/sys/unix"
)

// initGuest does the minimum an init process must do before anything else
// can run. The root filesystem is the function's image, mounted read-only by
// the kernel; /dev is devtmpfs, which the guest kernel mounts itself.
func initGuest() error {
	mounts := []struct {
		source, target, fstype string
		flags                  uintptr
		data                   string
	}{
		{"proc", "/proc", "proc", unix.MS_NOSUID | unix.MS_NOEXEC | unix.MS_NODEV, ""},
		{"sysfs", "/sys", "sysfs", unix.MS_NOSUID | unix.MS_NOEXEC | unix.MS_NODEV, ""},
		{"tmpfs", "/tmp", "tmpfs", unix.MS_NOSUID | unix.MS_NODEV, "mode=1777"},
		{"tmpfs", "/run", "tmpfs", unix.MS_NOSUID | unix.MS_NODEV, "mode=755"},
	}
	for _, m := range mounts {
		if err := os.MkdirAll(m.target, 0o755); err != nil && !os.IsExist(err) { //nolint:gosec // system mount points every guest user traverses
			// A read-only root cannot grow new directories; the builder is
			// expected to have created them.
			return fmt.Errorf("%s: %w", m.target, err)
		}
		if err := unix.Mount(m.source, m.target, m.fstype, m.flags, m.data); err != nil {
			return fmt.Errorf("mount %s: %w", m.target, err)
		}
	}
	return nil
}

func listenVsock(port uint32) (net.Listener, error) {
	return vsock.Listen(port, nil)
}
