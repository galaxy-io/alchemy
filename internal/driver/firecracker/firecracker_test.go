package firecracker

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/galaxy-io/alchemy/internal/driver"
)

// testDriver is a driver over a temporary DataDir, with nothing that needs
// root or KVM.
func testDriver(t *testing.T) *Driver {
	t.Helper()
	d := &Driver{
		cfg:          Config{DataDir: t.TempDir(), Snapshots: true},
		log:          slog.New(slog.DiscardHandler),
		uids:         newUIDs(100000),
		generation:   "gen",
		supervisorID: "sup",
	}
	for _, dir := range []string{d.rootfsDir(), d.layersDir(), d.snapshotsDir()} {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			t.Fatal(err)
		}
	}
	return d
}

func touch(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// snapshotFor writes a complete snapshot for id.
func snapshotFor(t *testing.T, d *Driver, id string) {
	t.Helper()
	for _, name := range []string{"vmstate", "mem"} {
		touch(t, filepath.Join(d.snapshotsDir(), id, name))
	}
}

func TestForgetWithoutIDKeepsSnapshots(t *testing.T) {
	d := testDriver(t)
	snapshotFor(t, d, "other")
	a := &driver.Artifact{Digest: "sha256:build", Layers: []string{"source"}}
	touch(t, d.rootfsPath(a.Digest))
	touch(t, d.layersPath(a.Layers))

	if err := d.Forget(context.Background(), a, []*driver.Artifact{{Digest: a.Digest}}); err != nil {
		t.Fatal(err)
	}
	if !exists(d.snapshotsDir()) {
		t.Fatal("Forget of an artifact without an id removed the snapshot cache")
	}
	if d.snapshotPath(&driver.Artifact{ID: "other"}) == "" {
		t.Error("Forget of an artifact without an id removed another artifact's snapshot")
	}
	if !exists(d.rootfsPath(a.Digest)) {
		t.Error("Forget removed a root filesystem keep shares")
	}
	if exists(d.layersPath(a.Layers)) {
		t.Error("Forget kept a layer drive nothing shares")
	}
}

func TestForgetRemovesOnlyItsSnapshot(t *testing.T) {
	d := testDriver(t)
	snapshotFor(t, d, "a")
	snapshotFor(t, d, "b")
	a := &driver.Artifact{ID: "a", Digest: "sha256:image"}
	touch(t, d.rootfsPath(a.Digest))

	if err := d.Forget(context.Background(), a, nil); err != nil {
		t.Fatal(err)
	}
	if d.snapshotPath(a) != "" {
		t.Error("Forget kept the artifact's snapshot")
	}
	if d.snapshotPath(&driver.Artifact{ID: "b"}) == "" {
		t.Error("Forget removed another artifact's snapshot")
	}
	if exists(d.rootfsPath(a.Digest)) {
		t.Error("Forget kept a root filesystem nothing shares")
	}
}

func TestForgetKeepsSharedLayers(t *testing.T) {
	d := testDriver(t)
	a := &driver.Artifact{Digest: "sha256:build", Layers: []string{"source"}}
	touch(t, d.layersPath(a.Layers))

	keep := []*driver.Artifact{{Digest: a.Digest}, {Layers: a.Layers}}
	if err := d.Forget(context.Background(), a, keep); err != nil {
		t.Fatal(err)
	}
	if !exists(d.layersPath(a.Layers)) {
		t.Error("Forget removed a layer drive keep shares")
	}
}

// shortTempDir is a directory short enough for a Unix socket path, which
// t.TempDir on macOS is not.
func shortTempDir(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp("", "fc")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	return dir
}

func TestWaitForSocketReturnsWhenListening(t *testing.T) {
	path := filepath.Join(shortTempDir(t), "api.sock")
	l, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = l.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := waitForSocket(ctx, path, make(chan struct{})); err != nil {
		t.Fatal(err)
	}
}

func TestWaitForSocketFailsWhenProcessExits(t *testing.T) {
	exited := make(chan struct{})
	close(exited)
	// No deadline: before the fix this waited forever.
	done := make(chan error, 1)
	go func() {
		done <- waitForSocket(context.Background(), filepath.Join(shortTempDir(t), "api.sock"), exited)
	}()
	select {
	case err := <-done:
		if !errors.Is(err, errExited) {
			t.Fatalf("got %v, want errExited", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("waitForSocket did not return after the process exited")
	}
}

func TestWaitForGuestFailsWhenProcessExits(t *testing.T) {
	exited := make(chan struct{})
	close(exited)
	done := make(chan error, 1)
	go func() {
		done <- waitForGuest(context.Background(), filepath.Join(shortTempDir(t), "v.sock"), supervisorPort, exited)
	}()
	select {
	case err := <-done:
		if !errors.Is(err, errExited) {
			t.Fatalf("got %v, want errExited", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("waitForGuest did not return after the process exited")
	}
}

func TestReleaseOfFailedInstanceKeepsOnlyItsLog(t *testing.T) {
	d := testDriver(t)
	mem := filepath.Join(d.snapshotsDir(), "a", "mem")
	touch(t, mem)
	j := &jail{dir: filepath.Join(d.cfg.DataDir, "jail", jailExec, "id")}
	j.root = filepath.Join(j.dir, "root")
	touch(t, filepath.Join(j.dir, "firecracker.log"))
	if err := os.MkdirAll(j.root, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(mem, j.host(jailMemory)); err != nil {
		t.Fatal(err)
	}
	uid, err := d.uids.take()
	if err != nil {
		t.Fatal(err)
	}
	s := &instance{driver: d, id: "id", uid: uid, jail: j, keepDir: true}

	s.Release(context.Background())
	if exists(j.root) {
		t.Error("Release of a failed instance kept its chroot, and the hard links in it")
	}
	if !exists(s.logPath()) {
		t.Error("Release of a failed instance removed its log")
	}
}

func TestReleaseRemovesJail(t *testing.T) {
	d := testDriver(t)
	j := &jail{dir: filepath.Join(d.cfg.DataDir, "jail", jailExec, "id")}
	j.root = filepath.Join(j.dir, "root")
	touch(t, filepath.Join(j.root, "rootfs.ext4"))
	uid, err := d.uids.take()
	if err != nil {
		t.Fatal(err)
	}
	s := &instance{driver: d, id: "id", uid: uid, jail: j}

	s.Release(context.Background())
	if exists(j.dir) {
		t.Error("Release kept the jail")
	}
	if d.uids.inUse[uid] {
		t.Error("Release kept the instance's uid")
	}
}
