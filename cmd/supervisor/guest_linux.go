package main

import (
	"errors"
	"fmt"
	"net"
	"os"

	"github.com/mdlayher/vsock"
	"golang.org/x/sys/unix"
)

// layersDevice is the second drive, when the host attached one: the
// version's layers, laid over the root filesystem before anything runs.
const layersDevice = "/dev/vdb"

// initGuest does the minimum an init process must do before anything else
// can run. The root filesystem is the function's image, mounted read-only by
// the kernel; /dev is devtmpfs, which the guest kernel mounts itself.
func initGuest() error {
	if err := overlayLayers(); err != nil {
		return fmt.Errorf("layers: %w", err)
	}
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

// overlayLayers makes the layer drive the top of the root filesystem: the
// drive and the image are the lower directories of a read-only overlay,
// which becomes the root. Everything is staged on a tmpfs that the old root
// takes with it when it is detached, the kernel's /dev among it, so devtmpfs
// is mounted again on the new root. Without the drive the root is the image
// alone.
func overlayLayers() error {
	if _, err := os.Stat(layersDevice); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	const stage = "/run"
	if err := unix.Mount("tmpfs", stage, "tmpfs", unix.MS_NOSUID|unix.MS_NODEV, "mode=755"); err != nil {
		return fmt.Errorf("mount %s: %w", stage, err)
	}
	lower, root := stage+"/layers", stage+"/root"
	for _, dir := range []string{lower, root} {
		if err := os.Mkdir(dir, 0o755); err != nil { //nolint:gosec // mount points
			return err
		}
	}
	if err := unix.Mount(layersDevice, lower, "ext4", unix.MS_RDONLY|unix.MS_NODEV, ""); err != nil {
		return fmt.Errorf("mount %s: %w", layersDevice, err)
	}
	if err := unix.Mount("overlay", root, "overlay", unix.MS_RDONLY, "lowerdir="+lower+":/"); err != nil {
		return fmt.Errorf("mount overlay: %w", err)
	}
	// pivot_root with the new root as put_old needs no scratch directory in
	// the read-only overlay; the old root is then detached from under it.
	if err := unix.Chdir(root); err != nil {
		return err
	}
	if err := unix.PivotRoot(".", "."); err != nil {
		return fmt.Errorf("pivot_root: %w", err)
	}
	if err := unix.Unmount(".", unix.MNT_DETACH); err != nil {
		return fmt.Errorf("detach old root: %w", err)
	}
	if err := unix.Chdir("/"); err != nil {
		return err
	}
	if err := unix.Mount("devtmpfs", "/dev", "devtmpfs", unix.MS_NOSUID, "mode=755"); err != nil {
		return fmt.Errorf("mount /dev: %w", err)
	}
	return nil
}

func listenVsock(port uint32) (net.Listener, error) {
	return vsock.Listen(port, nil)
}
