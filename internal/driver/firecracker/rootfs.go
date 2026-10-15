package firecracker

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/google/go-containerregistry/pkg/name"
	v1 "github.com/google/go-containerregistry/pkg/v1"
	"github.com/google/go-containerregistry/pkg/v1/mutate"
	"github.com/google/go-containerregistry/pkg/v1/remote"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/driver"
)

// supervisorPath is where the supervisor lives inside every rootfs; the
// kernel is told to start it as init.
const supervisorPath = "/sbin/supervisor"

// Build resolves the image in its registry, flattens it into a read-only
// ext4 root filesystem with the supervisor inside, and caches that by digest.
// No container daemon is involved; Firecracker only sees the ext4 file.
func (d *Driver) Build(ctx context.Context, spec *functionsv1.FunctionSpec) (*driver.Artifact, error) {
	ref, err := name.ParseReference(spec.GetImage())
	if err != nil {
		return nil, fmt.Errorf("image %q: %w", spec.GetImage(), err)
	}
	// The guest runs on this host's CPU, so a multi-arch image resolves to
	// this host's architecture.
	desc, err := remote.Get(ref,
		remote.WithContext(ctx),
		remote.WithAuthFromKeychain(d.cfg.Keychain),
		remote.WithPlatform(v1.Platform{OS: "linux", Architecture: runtime.GOARCH}))
	if err != nil {
		return nil, fmt.Errorf("resolve %s: %w", ref, err)
	}
	img, err := desc.Image()
	if err != nil {
		return nil, fmt.Errorf("resolve %s: %w", ref, err)
	}
	cfg, err := img.ConfigFile()
	if err != nil {
		return nil, fmt.Errorf("read %s config: %w", ref, err)
	}
	conf := cfg.Config

	argv := spec.GetCommand()
	if len(argv) == 0 {
		argv = append(append([]string{}, conf.Entrypoint...), conf.Cmd...)
	}
	if len(argv) == 0 {
		return nil, errors.New("image has no Entrypoint or Cmd and spec.command is empty")
	}
	env := make(map[string]string, len(conf.Env)+len(spec.GetEnv()))
	for _, kv := range conf.Env {
		k, v, _ := strings.Cut(kv, "=")
		env[k] = v
	}
	maps.Copy(env, spec.GetEnv())

	// The digest the reference resolved to (the index for a multi-arch
	// image): pulling repo@digest later gets the same image back.
	digest := desc.Digest.String()

	rootfs := filepath.Join(d.cfg.CacheDir, "rootfs", strings.ReplaceAll(digest, ":", "-")+".ext4")
	if _, err := os.Stat(rootfs); err != nil {
		if err := d.buildRootfs(ctx, img, rootfs); err != nil {
			return nil, fmt.Errorf("build rootfs: %w", err)
		}
	}
	var rootfsBytes int64
	if fi, err := os.Stat(rootfs); err == nil {
		rootfsBytes = fi.Size()
	}

	return &driver.Artifact{
		Image:       rootfs,
		Digest:      digest,
		RootfsBytes: rootfsBytes,
		Argv:        argv,
		Env:         env,
		WorkingDir:  conf.WorkingDir,
		Protocol:    driver.SupervisorProtocol(spec.GetProtocol()),
		VCPUs:       spec.GetResources().GetVcpus(),
		MemoryMiB:   spec.GetResources().GetMemoryMib(),
	}, nil
}

// buildRootfs flattens the image's layers into a directory, adds the
// supervisor and the mount points init needs, and packs it into an ext4 image
// with mke2fs -d, which needs neither root nor a loop device.
func (d *Driver) buildRootfs(ctx context.Context, img v1.Image, out string) error {
	if err := os.MkdirAll(filepath.Dir(out), 0o750); err != nil {
		return err
	}
	work, err := os.MkdirTemp(filepath.Dir(out), ".build-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.RemoveAll(work) }()
	root := filepath.Join(work, "root")
	if err := os.Mkdir(root, 0o755); err != nil { //nolint:gosec // becomes the guest's /
		return err
	}

	// Extract applies the layers in order, whiteouts included, as one tar
	// stream of the final filesystem.
	layers := mutate.Extract(img)
	defer func() { _ = layers.Close() }()
	untar := exec.CommandContext(ctx, "tar", "--extract", "--directory", root, //nolint:gosec // root is a fresh temp dir
		"--exclude=dev/*", "--no-same-owner")
	untar.Stdin = layers
	var tarErr bytes.Buffer
	untar.Stderr = &tarErr
	if err := untar.Run(); err != nil {
		return fmt.Errorf("extract image: %w: %s", err, bytes.TrimSpace(tarErr.Bytes()))
	}

	for _, dir := range []string{"dev", "proc", "sys", "tmp", "run", "sbin"} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o755); err != nil { //nolint:gosec // guest filesystem; mount points must be world-searchable
			return err
		}
	}
	if err := copyFile(d.cfg.SupervisorBin, filepath.Join(root, supervisorPath), 0o755); err != nil {
		return fmt.Errorf("install supervisor: %w", err)
	}

	size, err := dirSizeMiB(root)
	if err != nil {
		return err
	}
	// Several hosts may share the cache and build the same image at once;
	// each writes its own file and the rename makes one of them the result.
	f, err := os.CreateTemp(filepath.Dir(out), ".rootfs-*.ext4")
	if err != nil {
		return err
	}
	tmp := f.Name()
	_ = f.Close()
	mkfs := exec.CommandContext(ctx, "mke2fs", "-q", "-F", "-t", "ext4", "-m", "0", //nolint:gosec // paths are ours
		"-E", "root_owner=0:0", "-d", root, tmp, fmt.Sprintf("%dM", size+64))
	if msg, err := mkfs.CombinedOutput(); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("mke2fs: %w: %s", err, bytes.TrimSpace(msg))
	}
	return os.Rename(tmp, out)
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer func() { _ = in.Close() }()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

func dirSizeMiB(dir string) (int64, error) {
	var total int64
	err := filepath.WalkDir(dir, func(_ string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		total += info.Size()
		return nil
	})
	return total>>20 + 1, err
}
