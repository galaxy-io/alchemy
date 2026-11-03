package host

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"time"

	"gocloud.dev/blob"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/driver"
)

// compileLogBytes is how much of a compiler's output the reply carries.
const compileLogBytes = 64 << 10

// handleCompile runs a build image once over a source and keeps what it
// writes to stdout, a tar of the compiled files, as a layer in the artifacts
// bucket. The build image's root filesystem stays cached for the next
// compile; the source's layer drive does not.
func (h *Host) handleCompile(ctx context.Context, data []byte) proto.Message {
	req := &hostv1.CompileRequest{}
	if err := proto.Unmarshal(data, req); err != nil {
		return compileError("invalid_argument", err)
	}
	if h.layers == nil {
		return compileError("failed_precondition", errors.New("this host has no artifact bucket"))
	}
	log := h.log.With("image", req.GetImage(), "key", req.GetKey())
	start := time.Now()

	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		return compileError("resource_exhausted", errors.New("host is at capacity"))
	}

	timeout := time.Duration(req.GetTimeoutMs()) * time.Millisecond
	ctx, cancel := context.WithTimeout(ctx, timeout+supervisorGrace)
	defer cancel()
	layers, err := h.driverLayers([]*hostv1.Layer{req.GetSource()})
	if err != nil {
		return compileError("failed_precondition", err)
	}
	// A compile is short, so on a host whose whole budget is smaller than
	// what it asks for it takes the whole budget instead.
	memory := req.GetMemoryMib()
	if h.cfg.MemoryMiB > 0 {
		memory = min(memory, uint32(min(h.cfg.MemoryMiB, math.MaxUint32))) //nolint:gosec // bounded above
	}
	spec := &functionsv1.FunctionSpec{
		Image:     req.GetImage(),
		Protocol:  functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_EXEC,
		Resources: &functionsv1.Resources{Vcpus: req.GetVcpus(), MemoryMib: memory},
	}
	// Builds and evictions take the drives exclusively; this one holds them
	// until the compiler has run.
	h.drives.RLock()
	defer h.drives.RUnlock()
	built, err := h.driver.Build(ctx, spec, layers)
	if err != nil {
		return compileError("internal", fmt.Errorf("build %s: %w", req.GetImage(), err))
	}
	defer h.forgetCompile(built)
	artifact := toProto(&hostv1.BuildRequest{TenantId: req.GetTenantId(), Spec: spec, Layers: []*hostv1.Layer{req.GetSource()}}, built)

	live, err := h.admit(artifact)
	if err != nil {
		return compileError("resource_exhausted", err)
	}
	instance, kind, err := h.driver.Acquire(ctx, built)
	if err != nil {
		h.untrack(live)
		return compileError("unavailable", fmt.Errorf("acquire instance: %w", err))
	}
	live.ready(instance, kind, "")
	defer h.release(live)

	logs := &tailBuffer{max: compileLogBytes}
	res, err := instance.Invoke(ctx, &supervisorv1.InvokeRequest{
		TimeoutMs:  timeout.Milliseconds(),
		HostTimeMs: time.Now().UnixMilli(),
	}, logs)
	switch {
	case err != nil:
		return &hostv1.CompileResponse{Result: &hostv1.CompileResponse_Error{Error: &hostv1.Error{Code: "aborted", Message: fmt.Sprintf("compile: %v", err)}}, BuildLog: logs.String()}
	case res.GetFailure() != nil:
		msg := res.GetFailure().GetMessage()
		if res.GetFailure().GetKind() == supervisorv1.FailureKind_FAILURE_KIND_TIMEOUT {
			msg = fmt.Sprintf("compile exceeded %s", timeout)
		}
		return &hostv1.CompileResponse{Result: &hostv1.CompileResponse_Error{Error: &hostv1.Error{Code: "failed_precondition", Message: "compile failed: " + msg}}, BuildLog: logs.String()}
	case len(res.GetOutput()) == 0:
		return &hostv1.CompileResponse{Result: &hostv1.CompileResponse_Error{Error: &hostv1.Error{Code: "internal", Message: "compile wrote no output"}}, BuildLog: logs.String()}
	}

	out := res.GetOutput()
	sum := sha256.Sum256(out)
	layer := &hostv1.Layer{Key: req.GetKey(), Sha256: hex.EncodeToString(sum[:])}
	if err := h.layers.WriteAll(ctx, layer.GetKey(), out, &blob.WriterOptions{
		ContentType: "application/x-tar",
		Metadata:    map[string]string{bus.LayerDigestMetadata: layer.GetSha256()},
	}); err != nil {
		return compileError("internal", fmt.Errorf("keep compiled layer: %w", err))
	}
	log.Info("compile ready", "bytes", len(out), "took", time.Since(start).Round(time.Millisecond))
	return &hostv1.CompileResponse{Result: &hostv1.CompileResponse_Layer{Layer: layer}, BuildLog: logs.String()}
}

// forgetCompile drops a compile's layer drive and keeps the build image's
// root filesystem, which every compile on that image shares.
func (h *Host) forgetCompile(a *driver.Artifact) {
	keep := []*driver.Artifact{{Digest: a.Digest}}
	if err := h.driver.Forget(context.WithoutCancel(h.background), a, keep); err != nil {
		h.log.Warn("forget compile", "image", a.Image, "err", err)
	}
}

func compileError(code string, err error) *hostv1.CompileResponse {
	return &hostv1.CompileResponse{Result: &hostv1.CompileResponse_Error{Error: &hostv1.Error{Code: code, Message: err.Error()}}}
}

// tailBuffer keeps the last max bytes written to it.
type tailBuffer struct {
	max int
	buf bytes.Buffer
}

func (t *tailBuffer) Write(p []byte) (int, error) {
	t.buf.Write(p)
	if over := t.buf.Len() - t.max; over > 0 {
		t.buf.Next(over)
	}
	return len(p), nil
}

func (t *tailBuffer) String() string { return t.buf.String() }
