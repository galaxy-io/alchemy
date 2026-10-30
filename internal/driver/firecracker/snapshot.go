package firecracker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"github.com/galaxy-io/alchemy/internal/driver"
)

// A snapshot is a microVM's memory and device state the moment Start
// returned, kept per artifact so Acquire resumes it instead of booting a
// kernel and starting the supervisor again. It is only good for the
// Firecracker, kernel and supervisor it was taken with, so the cache is
// keyed by a generation of those three and an older generation is dropped
// when the host starts.

// snapshotGeneration hashes the Firecracker build, the kernel and the
// supervisor binary.
func snapshotGeneration(cfg Config) (string, error) {
	h := sha256.New()
	out, err := exec.Command(cfg.FirecrackerBin, "--version").Output() //nolint:gosec // operator-configured path
	if err != nil {
		return "", fmt.Errorf("firecracker --version: %w", err)
	}
	h.Write(out)
	for _, path := range []string{cfg.Kernel, cfg.SupervisorBin} {
		f, err := os.Open(path)
		if err != nil {
			return "", err
		}
		_, err = io.Copy(h, f)
		_ = f.Close()
		if err != nil {
			return "", err
		}
	}
	return hex.EncodeToString(h.Sum(nil))[:16], nil
}

// snapshotsDir holds this generation's snapshots, one directory per
// artifact id with the vmstate and memory files in it.
func (d *Driver) snapshotsDir() string {
	return filepath.Join(d.cfg.DataDir, "snapshots", d.generation)
}

// dropStaleSnapshots removes every other generation's snapshots.
func (d *Driver) dropStaleSnapshots() error {
	entries, err := os.ReadDir(filepath.Join(d.cfg.DataDir, "snapshots"))
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.Name() == d.generation {
			continue
		}
		if err := os.RemoveAll(filepath.Join(d.cfg.DataDir, "snapshots", e.Name())); err != nil {
			return err
		}
	}
	return nil
}

// snapshotPath is a's snapshot directory when it has a complete one, or "".
func (d *Driver) snapshotPath(a *driver.Artifact) string {
	if a.ID == "" {
		return ""
	}
	dir := filepath.Join(d.snapshotsDir(), a.ID)
	for _, name := range []string{"vmstate", "mem"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			return ""
		}
	}
	return dir
}

// Snapshot boots a, starts it, pauses it and writes its snapshot into the
// cache, then kills it. An artifact that has one already is left alone. The
// memory file is as large as the microVM's memory and shared read-only by
// every restore, which maps it privately.
func (d *Driver) Snapshot(ctx context.Context, a *driver.Artifact) error {
	if !d.cfg.Snapshots || a.ID == "" || d.snapshotPath(a) != "" {
		return nil
	}
	sb, err := d.start(ctx, a, nil, (*instance).boot)
	if err != nil {
		return err
	}
	defer sb.Release(context.WithoutCancel(ctx))
	if err := sb.snapshot(ctx); err != nil {
		return err
	}
	// The files are the jail's, written by its uid; they move into the
	// cache before the jail goes, and every microVM uid must read them.
	work, err := os.MkdirTemp(d.snapshotsDir(), ".snapshot-*")
	if err != nil {
		return err
	}
	for _, name := range []string{jailVMState, jailMemory} {
		dst := filepath.Join(work, filepath.Base(name))
		if err := os.Rename(sb.jail.host(name), dst); err != nil {
			_ = os.RemoveAll(work)
			return err
		}
		if err := os.Chmod(dst, 0o444); err != nil { //nolint:gosec // read by every microVM uid
			_ = os.RemoveAll(work)
			return err
		}
	}
	if err := os.Chmod(work, 0o755); err != nil { //nolint:gosec // traversed by every microVM uid
		_ = os.RemoveAll(work)
		return err
	}
	if err := os.Rename(work, filepath.Join(d.snapshotsDir(), a.ID)); err != nil {
		_ = os.RemoveAll(work)
		// Another build of the same artifact got there first.
		if errors.Is(err, syscall.EEXIST) || errors.Is(err, syscall.ENOTEMPTY) {
			return nil
		}
		return err
	}
	return nil
}

// snapshot pauses the microVM and has Firecracker write a full snapshot
// into the jail.
func (s *instance) snapshot(ctx context.Context) error {
	dir := s.jail.host(filepath.Dir(jailVMState))
	if err := os.Mkdir(dir, 0o700); err != nil {
		return err
	}
	if err := os.Chown(dir, s.uid, s.uid); err != nil {
		return err
	}
	fc := newAPI(s.jail.host(jailAPISocket))
	if err := fc.patch(ctx, "/vm", map[string]any{"state": "Paused"}); err != nil {
		return s.failed(err)
	}
	if err := fc.put(ctx, "/snapshot/create", map[string]any{
		"snapshot_type": "Full",
		"snapshot_path": jailVMState,
		"mem_file_path": jailMemory,
	}); err != nil {
		return s.failed(err)
	}
	return nil
}

// Forget removes a's snapshot, and its drives when no artifact in keep
// shares them. A running microVM holds hard links to all of them, so it is
// unaffected.
func (d *Driver) Forget(_ context.Context, a *driver.Artifact, keep []*driver.Artifact) error {
	paths := []string{filepath.Join(d.snapshotsDir(), a.ID)}
	rootfsShared, layersShared := false, false
	for _, k := range keep {
		rootfsShared = rootfsShared || k.Digest == a.Digest
		layersShared = layersShared || (len(a.Layers) > 0 && d.layersPath(k.Layers) == d.layersPath(a.Layers))
	}
	if !rootfsShared {
		paths = append(paths, d.rootfsPath(a.Digest))
	}
	if layers := d.layersPath(a.Layers); layers != "" && !layersShared {
		paths = append(paths, layers)
	}
	var errs []error
	for _, p := range paths {
		if err := os.RemoveAll(p); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
