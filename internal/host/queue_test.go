package host

import (
	"errors"
	"testing"
	"time"

	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
	"github.com/galaxy-io/alchemy/internal/artifact"
)

func queuedRequest() *hostv1.InvokeRequest {
	a := &hostv1.Artifact{TenantId: "t1", FunctionId: "f1", Version: 3, Digest: "sha256:abc", Vcpus: 1, MemoryMib: 128}
	a.Id = artifact.ID(a)
	return &hostv1.InvokeRequest{
		Invocation: &functionsv1.Invocation{TenantId: "t1", FunctionId: "f1", Id: "inv-1", Version: 3},
		Artifact:   a,
		Build:      &hostv1.BuildRequest{Resources: &functionsv1.Resources{Vcpus: 1, MemoryMib: 128}},
	}
}

func TestResize(t *testing.T) {
	tests := []struct {
		name        string
		cfg         *hostv1.FunctionConfig
		wantVcpus   uint32
		wantMemory  uint32
		wantReplace bool
	}{
		{name: "no config", cfg: nil, wantVcpus: 1, wantMemory: 128},
		{name: "no resources", cfg: &hostv1.FunctionConfig{MaxConcurrency: 2}, wantVcpus: 1, wantMemory: 128},
		{name: "same size", cfg: &hostv1.FunctionConfig{Resources: &functionsv1.Resources{Vcpus: 1, MemoryMib: 128}}, wantVcpus: 1, wantMemory: 128},
		{name: "more memory", cfg: &hostv1.FunctionConfig{Resources: &functionsv1.Resources{Vcpus: 1, MemoryMib: 512}}, wantVcpus: 1, wantMemory: 512, wantReplace: true},
		{name: "more vcpus", cfg: &hostv1.FunctionConfig{Resources: &functionsv1.Resources{Vcpus: 4, MemoryMib: 128}}, wantVcpus: 4, wantMemory: 128, wantReplace: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := queuedRequest()
			queued := req.GetArtifact()
			before := proto.Clone(queued).(*hostv1.Artifact)

			resize(req, tt.cfg)

			got := req.GetArtifact()
			if got.GetVcpus() != tt.wantVcpus || got.GetMemoryMib() != tt.wantMemory {
				t.Errorf("artifact = %d vCPU %d MiB, want %d and %d", got.GetVcpus(), got.GetMemoryMib(), tt.wantVcpus, tt.wantMemory)
			}
			if r := req.GetBuild().GetResources(); r.GetVcpus() != tt.wantVcpus || r.GetMemoryMib() != tt.wantMemory {
				t.Errorf("build resources = %v, want %d vCPU %d MiB", r, tt.wantVcpus, tt.wantMemory)
			}
			if replaced := got != queued; replaced != tt.wantReplace {
				t.Errorf("artifact replaced = %v, want %v", replaced, tt.wantReplace)
			}
			// The server names the same artifact for the same resources.
			if id := artifact.ID(got); got.GetId() != id {
				t.Errorf("artifact id = %s, want %s", got.GetId(), id)
			}
			// The queued artifact may be shared, as the server's cached one is.
			if !proto.Equal(queued, before) {
				t.Error("resize modified the artifact it was given")
			}
		})
	}
}

func TestResizeWithoutBuild(t *testing.T) {
	req := queuedRequest()
	req.Build = nil
	resize(req, &hostv1.FunctionConfig{Resources: &functionsv1.Resources{Vcpus: 2, MemoryMib: 256}})
	if req.GetBuild() != nil {
		t.Error("resize added a build")
	}
	if req.GetArtifact().GetMemoryMib() != 256 {
		t.Error("artifact not resized")
	}
}

func TestRunningByFunction(t *testing.T) {
	h := &Host{running: make(map[functionKey]int32)}
	inv := func(tenant, fn string) *functionsv1.Invocation {
		return &functionsv1.Invocation{TenantId: tenant, FunctionId: fn}
	}
	doneA1 := h.runningOne(inv("t1", "a"))
	doneA2 := h.runningOne(inv("t1", "a"))
	doneB := h.runningOne(inv("t1", "b"))

	counts := func() map[string]int32 {
		out := map[string]int32{}
		for _, r := range h.runningByFunction() {
			out[r.GetFunctionId()] = r.GetCount()
		}
		return out
	}
	if got := counts(); got["a"] != 2 || got["b"] != 1 || len(got) != 2 {
		t.Fatalf("running = %v, want a:2 b:1", got)
	}
	doneA1()
	doneB()
	if got := counts(); got["a"] != 1 || len(got) != 1 {
		t.Fatalf("running = %v, want a:1 and b gone", got)
	}
	doneA2()
	if got := h.runningByFunction(); len(got) != 0 {
		t.Fatalf("running = %v, want nothing", got)
	}
}

func TestFunctionError(t *testing.T) {
	tests := []struct {
		kind supervisorv1.FailureKind
		want functionsv1.FunctionErrorKind
	}{
		{supervisorv1.FailureKind_FAILURE_KIND_RAISED, functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_RAISED},
		{supervisorv1.FailureKind_FAILURE_KIND_TIMEOUT, functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_TIMEOUT},
		// Anything the host does not recognise is the function crashing.
		{supervisorv1.FailureKind(0), functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_CRASHED},
		{supervisorv1.FailureKind(999), functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_CRASHED},
	}
	for _, tt := range tests {
		t.Run(tt.kind.String(), func(t *testing.T) {
			got := functionError(&supervisorv1.Failure{Kind: tt.kind, Message: "boom", Type: "ValueError"})
			if got.GetKind() != tt.want {
				t.Errorf("kind = %v, want %v", got.GetKind(), tt.want)
			}
			if got.GetMessage() != "boom" || got.GetType() != "ValueError" {
				t.Errorf("message and type not carried: %v", got)
			}
		})
	}
}

func TestRetryBackoff(t *testing.T) {
	req := &hostv1.InvokeRequest{RetryBackoffMs: 1000, RetryBackoffMaxMs: 300_000}
	tests := []struct {
		failed int
		want   time.Duration
	}{
		{1, time.Second},
		{2, 5 * time.Second},
		{3, 25 * time.Second},
		{4, 125 * time.Second},
		{5, 5 * time.Minute},
		{10, 5 * time.Minute},
	}
	for _, tt := range tests {
		t.Run(tt.want.String(), func(t *testing.T) {
			for range 50 {
				got := retryBackoff(req, tt.failed)
				low, high := tt.want-tt.want/5, min(tt.want+tt.want/5, 5*time.Minute)
				if got < low || got > high {
					t.Fatalf("retryBackoff(%d) = %v, want within [%v, %v]", tt.failed, got, low, high)
				}
			}
		})
	}
}

func TestRetryBackoffWithoutBackoff(t *testing.T) {
	if got := retryBackoff(&hostv1.InvokeRequest{}, 3); got != 0 {
		t.Errorf("retryBackoff with no backoff = %v, want 0", got)
	}
}

func TestRetryable(t *testing.T) {
	fnErr := func(kind functionsv1.FunctionErrorKind) *hostv1.InvokeResponse {
		return &hostv1.InvokeResponse{Result: &hostv1.InvokeResponse_FunctionError{FunctionError: &functionsv1.FunctionError{Kind: kind}}}
	}
	tests := []struct {
		name string
		resp *hostv1.InvokeResponse
		want bool
	}{
		{"succeeded", &hostv1.InvokeResponse{Result: &hostv1.InvokeResponse_Output{Output: []byte("{}")}}, false},
		{"platform error", invokeError("unavailable", errors.New("boot failed")), true},
		{"aborted", invokeError("aborted", errors.New("instance went away")), true},
		{"raised", fnErr(functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_RAISED), true},
		{"crashed", fnErr(functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_CRASHED), true},
		{"timeout", fnErr(functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_TIMEOUT), true},
		{"input invalid", fnErr(functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_INPUT_INVALID), false},
		{"output invalid", fnErr(functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_OUTPUT_INVALID), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := retryable(tt.resp); got != tt.want {
				t.Errorf("retryable = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestEnded(t *testing.T) {
	accepted := &functionsv1.Invocation{Id: "inv-1", Attempts: 2, Async: true}
	got := ended("h1", accepted, functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED, "expired")
	if got.GetHost() != "h1" || got.GetStatus() != functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED ||
		got.GetPlatformError() != "expired" || got.GetEndedAt() == 0 || got.GetAttempts() != 2 || !got.GetAsync() {
		t.Errorf("ended = %v", got)
	}
	if accepted.GetHost() != "" || accepted.GetEndedAt() != 0 {
		t.Error("ended modified the accepted invocation")
	}
}
