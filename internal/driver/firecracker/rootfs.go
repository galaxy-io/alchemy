package firecracker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/driver"
)

// supervisorPath is where the supervisor lives inside every rootfs; the
// kernel is told to start it as init.
const supervisorPath = "/sbin/supervisor"

type imageInspect struct {
	ID          string   `json:"Id"`
	RepoDigests []string `json:"RepoDigests"`
	Config      struct {
		Entrypoint []string `json:"Entrypoint"`
		Cmd        []string `json:"Cmd"`
		Env        []string `json:"Env"`
		WorkingDir string   `json:"WorkingDir"`
	} `json:"Config"`
}

// Build resolves the image with the local Docker daemon, flattens it into a
// read-only ext4 root filesystem with the supervisor inside, and caches that
// by digest. Firecracker never talks to Docker; it only sees the ext4 file.
func (d *Driver) Build(ctx context.Context, spec *functionsv1.FunctionSpec) (*driver.Artifact, error) {
	img, err := inspectImage(ctx, spec.GetImage())
	if err != nil {
		if _, pullErr := docker(ctx, "pull", "--quiet", spec.GetImage()); pullErr != nil {
			return nil, fmt.Errorf("pull %s: %w", spec.GetImage(), pullErr)
		}
		if img, err = inspectImage(ctx, spec.GetImage()); err != nil {
			return nil, err
		}
	}

	argv := spec.GetCommand()
	if len(argv) == 0 {
		argv = append(append([]string{}, img.Config.Entrypoint...), img.Config.Cmd...)
	}
	if len(argv) == 0 {
		return nil, errors.New("image has no Entrypoint or Cmd and spec.command is empty")
	}
	env := make(map[string]string, len(img.Config.Env)+len(spec.GetEnv()))
	for _, kv := range img.Config.Env {
		k, v, _ := strings.Cut(kv, "=")
		env[k] = v
	}
	maps.Copy(env, spec.GetEnv())

	digest := img.ID
	if len(img.RepoDigests) > 0 {
		if _, dg, ok := strings.Cut(img.RepoDigests[0], "@"); ok {
			digest = dg
		}
	}

	rootfs := filepath.Join(d.cfg.CacheDir, "rootfs", strings.ReplaceAll(digest, ":", "-")+".ext4")
	if _, err := os.Stat(rootfs); err != nil {
		if err := d.buildRootfs(ctx, img.ID, rootfs); err != nil {
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
		WorkingDir:  img.Config.WorkingDir,
		Protocol:    driver.SupervisorProtocol(spec.GetProtocol()),
		VCPUs:       spec.GetResources().GetVcpus(),
		MemoryMiB:   spec.GetResources().GetMemoryMib(),
	}, nil
}

// buildRootfs exports the image's filesystem, adds the supervisor and the
// mount points init needs, and packs it into an ext4 image with mke2fs -d,
// which needs neither root nor a loop device.
func (d *Driver) buildRootfs(ctx context.Context, imageID, out string) error {
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

	// docker create needs a command even though nothing is run.
	cid, err := docker(ctx, "create", "--entrypoint", "/", imageID)
	if err != nil {
		return err
	}
	defer func() { _, _ = docker(context.WithoutCancel(ctx), "rm", "--force", cid) }()

	export := exec.CommandContext(ctx, "docker", "export", cid)                //nolint:gosec // cid comes from docker create above
	untar := exec.CommandContext(ctx, "tar", "--extract", "--directory", root, //nolint:gosec // root is a fresh temp dir
		"--exclude=dev/*", "--no-same-owner")
	untar.Stdin, err = export.StdoutPipe()
	if err != nil {
		return err
	}
	var tarErr bytes.Buffer
	untar.Stderr = &tarErr
	if err := untar.Start(); err != nil {
		return err
	}
	if err := export.Run(); err != nil {
		return fmt.Errorf("docker export: %w", err)
	}
	if err := untar.Wait(); err != nil {
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
	tmp := out + ".tmp"
	mkfs := exec.CommandContext(ctx, "mke2fs", "-q", "-F", "-t", "ext4", "-m", "0", //nolint:gosec // paths are ours
		"-E", "root_owner=0:0", "-d", root, tmp, fmt.Sprintf("%dM", size+64))
	if msg, err := mkfs.CombinedOutput(); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("mke2fs: %w: %s", err, bytes.TrimSpace(msg))
	}
	return os.Rename(tmp, out)
}

func inspectImage(ctx context.Context, image string) (*imageInspect, error) {
	out, err := docker(ctx, "image", "inspect", "--format", "{{json .}}", image)
	if err != nil {
		return nil, err
	}
	var img imageInspect
	if err := json.Unmarshal([]byte(out), &img); err != nil {
		return nil, fmt.Errorf("parse image inspect: %w", err)
	}
	return &img, nil
}

func docker(ctx context.Context, args ...string) (string, error) {
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "docker", args...) //nolint:gosec // args are built by this package
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return "", fmt.Errorf("docker %s: %s", args[0], msg)
		}
		return "", fmt.Errorf("docker %s: %w", args[0], err)
	}
	return strings.TrimSpace(stdout.String()), nil
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
