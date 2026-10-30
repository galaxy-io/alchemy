package server

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path"
	"slices"
	"strings"
	"time"

	"connectrpc.com/connect"
	"gocloud.dev/blob"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
)

// A source is small by construction: the files of one handler, not its
// dependencies, which come from the runtime image.
const (
	maxSourceFiles   = 64
	maxSourceBytes   = 1 << 20
	maxSourcePathLen = 255
	// sourceRoot is where the files land in the root filesystem, as a tar
	// path: the runtime images find their handler under /app.
	sourceRoot = "app/"
)

// takeSource turns a spec's source files into a layer in the artifacts
// bucket and leaves the spec naming the layer, with the files' paths and
// sizes but not their content. A spec that already names a layer and
// carries no content keeps the layer it names, once it is found in the
// bucket. The spec is the caller's copy.
func (s *Service) takeSource(ctx context.Context, spec *functionsv1.FunctionSpec) error {
	src := spec.GetSource()
	if src == nil {
		return nil
	}
	invalid := func(format string, args ...any) error {
		return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf(format, args...))
	}
	if s.artifacts == nil {
		return connect.NewError(connect.CodeFailedPrecondition, errors.New("the server has no artifacts bucket, so functions are built from images only"))
	}
	if err := validateSourceFiles(src.GetFiles()); err != nil {
		return invalid("spec.source.%w", err)
	}

	withContent := slices.ContainsFunc(src.GetFiles(), func(f *functionsv1.SourceFile) bool { return len(f.GetContent()) > 0 })
	if !withContent {
		layer := src.GetLayer()
		if layer.GetKey() == "" || layer.GetSha256() == "" {
			return invalid("spec.source.files carry no content and spec.source.layer names no archive")
		}
		// The key is derived from the digest under this tenant, so a spec
		// can only name a layer this tenant stored.
		if layer.GetKey() != s.layerKey(layer.GetSha256()) {
			return invalid("spec.source.layer %q is not this tenant's archive for its digest", layer.GetKey())
		}
		found, err := s.artifacts.Exists(ctx, layer.GetKey())
		if err != nil {
			return connect.NewError(connect.CodeInternal, fmt.Errorf("artifacts bucket: %w", err))
		}
		if !found {
			return invalid("spec.source.layer %q is not in the artifacts bucket", layer.GetKey())
		}
		return nil
	}

	archive, sum := packSource(src.GetFiles())
	key := s.layerKey(sum)
	found, err := s.artifacts.Exists(ctx, key)
	if err != nil {
		return connect.NewError(connect.CodeInternal, fmt.Errorf("artifacts bucket: %w", err))
	}
	if !found {
		if err := s.artifacts.WriteAll(ctx, key, archive, &blob.WriterOptions{ContentType: "application/x-tar"}); err != nil {
			return connect.NewError(connect.CodeInternal, fmt.Errorf("artifacts bucket: %w", err))
		}
	}
	src.Layer = &functionsv1.SourceLayer{Key: key, Sha256: sum}
	for _, f := range src.GetFiles() {
		f.Size = int64(len(f.GetContent()))
		f.Content = nil
	}
	return nil
}

// layerKey is where a source archive with the given digest lives in the
// artifacts bucket, under the tenant that stored it.
func (s *Service) layerKey(sum string) string {
	return s.tenant + "/layers/" + sum + ".tar"
}

// validateSourceFiles checks the files' count, size and paths. A path is
// relative, clean and unique, so every file lands under /app.
func validateSourceFiles(files []*functionsv1.SourceFile) error {
	if len(files) == 0 {
		return errors.New("files is required")
	}
	if len(files) > maxSourceFiles {
		return fmt.Errorf("files has more than %d entries", maxSourceFiles)
	}
	var total int
	seen := make(map[string]bool, len(files))
	for _, f := range files {
		p := f.GetPath()
		switch {
		case p == "":
			return errors.New("files: path is required")
		case len(p) > maxSourcePathLen:
			return fmt.Errorf("files: path %q is longer than %d bytes", p, maxSourcePathLen)
		case strings.ContainsRune(p, 0):
			return fmt.Errorf("files: path %q holds a NUL", p)
		case path.Clean(p) != p, strings.HasPrefix(p, "/"), p == ".", p == "..", strings.HasPrefix(p, "../"):
			return fmt.Errorf("files: path %q must be relative and clean, such as handler.py", p)
		case seen[p]:
			return fmt.Errorf("files: path %q appears twice", p)
		}
		seen[p] = true
		total += len(f.GetContent())
	}
	if total > maxSourceBytes {
		return fmt.Errorf("files hold more than %d bytes", maxSourceBytes)
	}
	return nil
}

// packSource writes the files as a tar archive under sourceRoot and returns
// it with its sha256. The archive is a function of the files alone, sorted
// by path with fixed stamps and modes, so the same files give the same
// digest and share one object and one rootfs cache entry.
func packSource(files []*functionsv1.SourceFile) ([]byte, string) {
	sorted := slices.Clone(files)
	slices.SortFunc(sorted, func(a, b *functionsv1.SourceFile) int { return strings.Compare(a.GetPath(), b.GetPath()) })
	epoch := time.Unix(0, 0)
	var buf bytes.Buffer
	w := tar.NewWriter(&buf)
	_ = w.WriteHeader(&tar.Header{Name: sourceRoot, Typeflag: tar.TypeDir, Mode: 0o755, ModTime: epoch})
	dirs := map[string]bool{}
	for _, f := range sorted {
		for dir := path.Dir(f.GetPath()); dir != "."; dir = path.Dir(dir) {
			if dirs[dir] {
				break
			}
			dirs[dir] = true
			_ = w.WriteHeader(&tar.Header{Name: sourceRoot + dir + "/", Typeflag: tar.TypeDir, Mode: 0o755, ModTime: epoch})
		}
		_ = w.WriteHeader(&tar.Header{Name: sourceRoot + f.GetPath(), Typeflag: tar.TypeReg, Mode: 0o644, Size: int64(len(f.GetContent())), ModTime: epoch})
		_, _ = w.Write(f.GetContent())
	}
	_ = w.Close()
	sum := sha256.Sum256(buf.Bytes())
	return buf.Bytes(), hex.EncodeToString(sum[:])
}

// sourceLayers is what a build extracts over the image for a spec: the
// source archive, or nothing.
func sourceLayers(spec *functionsv1.FunctionSpec) []*hostv1.Layer {
	layer := spec.GetSource().GetLayer()
	if layer == nil {
		return nil
	}
	return []*hostv1.Layer{{Key: layer.GetKey(), Sha256: layer.GetSha256()}}
}

// fillSource reads a version's source archive back and puts each file's
// content on the spec, for callers that show or edit the source. A spec
// without a source, or a server without a bucket, is left as it is.
func (s *Service) fillSource(ctx context.Context, spec *functionsv1.FunctionSpec) error {
	layer := spec.GetSource().GetLayer()
	if layer == nil || s.artifacts == nil {
		return nil
	}
	r, err := s.artifacts.NewReader(ctx, layer.GetKey(), nil)
	if err != nil {
		return fmt.Errorf("read source %s: %w", layer.GetKey(), err)
	}
	defer func() { _ = r.Close() }()
	contents := make(map[string][]byte, len(spec.GetSource().GetFiles()))
	tr := tar.NewReader(r)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("read source %s: %w", layer.GetKey(), err)
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		content, err := io.ReadAll(io.LimitReader(tr, maxSourceBytes+1))
		if err != nil {
			return fmt.Errorf("read source %s: %w", layer.GetKey(), err)
		}
		contents[strings.TrimPrefix(hdr.Name, sourceRoot)] = content
	}
	for _, f := range spec.GetSource().GetFiles() {
		f.Content = contents[f.GetPath()]
	}
	return nil
}
