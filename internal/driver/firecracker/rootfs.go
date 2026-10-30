package firecracker

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
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

// Build resolves the image in its registry and makes two read-only drives
// for it: the image flattened into an ext4 root filesystem with the
// supervisor inside, cached by the image digest and shared by every version
// on that image, and, when there are layers, a second ext4 holding the
// layers alone, cached by their digests. The guest overlays the second on
// the first. No container daemon is involved; Firecracker only sees the
// ext4 files.
func (d *Driver) Build(ctx context.Context, spec *functionsv1.FunctionSpec, layers []driver.Layer) (*driver.Artifact, error) {
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
	rootfs := d.rootfsPath(digest)
	if _, err := os.Stat(rootfs); err != nil {
		if err := d.buildRootfs(ctx, img, rootfs); err != nil {
			return nil, fmt.Errorf("build rootfs: %w", err)
		}
	}
	layerDigests := make([]string, len(layers))
	for i, l := range layers {
		layerDigests[i] = l.SHA256
	}
	drive := d.layersPath(layerDigests)
	if drive != "" {
		if _, err := os.Stat(drive); err != nil {
			if err := d.buildLayers(ctx, layers, drive); err != nil {
				return nil, fmt.Errorf("build layers: %w", err)
			}
		}
	}

	return &driver.Artifact{
		Image:       rootfs,
		Digest:      digest,
		Layers:      layerDigests,
		RootfsBytes: fileSize(rootfs) + fileSize(drive),
		Argv:        argv,
		Env:         env,
		WorkingDir:  conf.WorkingDir,
		Protocol:    driver.SupervisorProtocol(spec.GetProtocol()),
		VCPUs:       spec.GetResources().GetVcpus(),
		MemoryMiB:   spec.GetResources().GetMemoryMib(),
	}, nil
}

// rootfsPath is where the root filesystem for an image digest is cached on
// this host. Acquire finds the drives here rather than through
// Artifact.Image: the artifact is stored by the server and handed to every
// host, so a path one host wrote means nothing on another, or on the same
// host after its data dir moves.
func (d *Driver) rootfsPath(digest string) string {
	return filepath.Join(d.rootfsDir(), strings.ReplaceAll(digest, ":", "-")+".ext4")
}

// layersPath is where the drive holding these layers, in order, is cached
// on this host, or "" when there are none.
func (d *Driver) layersPath(layers []string) string {
	if len(layers) == 0 {
		return ""
	}
	h := sha256.New()
	for _, l := range layers {
		h.Write([]byte(l))
		h.Write([]byte{0})
	}
	return filepath.Join(d.layersDir(), hex.EncodeToString(h.Sum(nil))+".ext4")
}

// buildRootfs flattens the image into a directory, adds the supervisor and
// the mount points init needs, and packs it into an ext4 image.
func (d *Driver) buildRootfs(ctx context.Context, img v1.Image, out string) error {
	return d.buildDrive(ctx, out, func(root string) error {
		// Extract applies the image's layers in order, whiteouts included,
		// as one tar stream of the final filesystem.
		image := mutate.Extract(img)
		defer func() { _ = image.Close() }()
		if err := extract(ctx, root, image); err != nil {
			return fmt.Errorf("extract image: %w", err)
		}
		if err := d.installSupervisor(root); err != nil {
			return fmt.Errorf("install supervisor: %w", err)
		}
		return nil
	})
}

// buildLayers extracts the layers in order into a directory and packs it
// into an ext4 image, for the guest to lay over its root.
func (d *Driver) buildLayers(ctx context.Context, layers []driver.Layer, out string) error {
	return d.buildDrive(ctx, out, func(root string) error {
		readers := make([]*layerReader, len(layers))
		streams := make([]io.Reader, len(layers))
		for i, l := range layers {
			readers[i] = &layerReader{ctx: ctx, layer: l}
			streams[i] = readers[i]
		}
		defer func() {
			for _, r := range readers {
				r.close()
			}
		}()
		if err := extract(ctx, root, streams...); err != nil {
			return fmt.Errorf("extract layers: %w", err)
		}
		return nil
	})
}

// buildDrive has fill populate a fresh directory next to out, then packs it
// into an ext4 image at out with mke2fs -d, which needs neither root nor a
// loop device.
func (d *Driver) buildDrive(ctx context.Context, out string, fill func(root string) error) error {
	if err := os.MkdirAll(filepath.Dir(out), 0o750); err != nil {
		return err
	}
	work, err := os.MkdirTemp(filepath.Dir(out), ".build-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.RemoveAll(work) }()
	root := filepath.Join(work, "root")
	if err := os.Mkdir(root, 0o755); err != nil { //nolint:gosec // becomes a guest filesystem
		return err
	}
	if err := fill(root); err != nil {
		return err
	}

	size, err := dirSizeMiB(root)
	if err != nil {
		return err
	}
	// Two builds of the same drive may run at once; each writes its own file
	// and the rename makes one of them the result.
	f, err := os.CreateTemp(filepath.Dir(out), ".drive-*.ext4")
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
	// Jails hard-link this file, and each microVM's uid must be able to read
	// it. Nothing may write it: the drive is read-only and shared.
	if err := os.Chmod(tmp, 0o444); err != nil { //nolint:gosec // read by every microVM uid
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, out)
}

// extract unpacks tar streams into root, in order, as one tar process:
// --ignore-zeros reads past the end of each archive into the next, and tar
// defers creating symlinks until the end, which keeps a symlink in one
// archive from steering a later archive's files outside root.
func extract(ctx context.Context, root string, streams ...io.Reader) error {
	untar := exec.CommandContext(ctx, "tar", "--extract", "--ignore-zeros", "--directory", root, //nolint:gosec // root is a fresh temp dir
		"--exclude=dev/*", "--no-same-owner")
	untar.Stdin = io.MultiReader(streams...)
	var tarErr bytes.Buffer
	untar.Stderr = &tarErr
	if err := untar.Run(); err != nil {
		return fmt.Errorf("%w: %s", err, bytes.TrimSpace(tarErr.Bytes()))
	}
	return nil
}

// fileSize is the size of the file at path, or 0 when there is none.
func fileSize(path string) int64 {
	if path == "" {
		return 0
	}
	fi, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return fi.Size()
}

// installSupervisor adds the mount points init needs and the supervisor to
// an extracted image. The image is untrusted and the host runs as root, so
// every write goes through an os.Root: a symlink in the image that points
// outside it, such as sbin -> /etc, fails the build instead of letting the
// write land on the host.
func (d *Driver) installSupervisor(dir string) error {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()
	for _, mount := range []string{"dev", "proc", "sys", "tmp", "run", "sbin"} {
		if err := root.MkdirAll(mount, 0o755); err != nil { //nolint:gosec // guest filesystem; mount points must be world-searchable
			return err
		}
	}
	// Remove does not follow a final symlink, so whatever the image had at
	// this path goes, and O_EXCL makes the file below a new one.
	supervisor := strings.TrimPrefix(supervisorPath, "/")
	if err := root.Remove(supervisor); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	in, err := os.Open(d.cfg.SupervisorBin)
	if err != nil {
		return err
	}
	defer func() { _ = in.Close() }()
	out, err := root.OpenFile(supervisor, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
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

// layerReader reads a layer's archive, opened on first read, decompressed
// when it is gzipped. At the end of the archive it fails unless the bytes it
// read match the layer's digest, which fails the build.
type layerReader struct {
	ctx   context.Context
	layer driver.Layer
	raw   io.ReadCloser
	sum   hash.Hash
	body  *bufio.Reader // raw, through sum
	tar   io.Reader     // body, decompressed when gzipped
}

func (r *layerReader) Read(p []byte) (int, error) {
	if r.tar == nil {
		if err := r.open(); err != nil {
			return 0, err
		}
	}
	n, err := r.tar.Read(p)
	if errors.Is(err, io.EOF) {
		err = r.verify()
	}
	return n, err
}

func (r *layerReader) open() error {
	raw, err := r.layer.Open(r.ctx)
	if err != nil {
		return fmt.Errorf("open layer %s: %w", r.layer.SHA256, err)
	}
	r.raw, r.sum = raw, sha256.New()
	r.body = bufio.NewReader(io.TeeReader(raw, r.sum))
	r.tar = r.body
	if magic, _ := r.body.Peek(2); len(magic) == 2 && magic[0] == 0x1f && magic[1] == 0x8b {
		gz, err := gzip.NewReader(r.body)
		if err != nil {
			return fmt.Errorf("layer %s: %w", r.layer.SHA256, err)
		}
		r.tar = gz
	}
	return nil
}

// verify reads what decompression left of the archive and checks its
// digest. It returns io.EOF when the digest matches.
func (r *layerReader) verify() error {
	if _, err := io.Copy(io.Discard, r.body); err != nil {
		return fmt.Errorf("read layer %s: %w", r.layer.SHA256, err)
	}
	if got := hex.EncodeToString(r.sum.Sum(nil)); got != r.layer.SHA256 {
		return fmt.Errorf("layer %s: content has digest %s", r.layer.SHA256, got)
	}
	return io.EOF
}

// close releases the archive, read to the end or not.
func (r *layerReader) close() {
	if r.raw != nil {
		_ = r.raw.Close()
	}
}
