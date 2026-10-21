// Package driver is the seam between the control plane and whatever actually
// runs function code on a host.
package driver

import (
	"context"
	"io"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
)

// Artifact is a built function version: everything needed to start a instance
// for it without consulting the spec again.
type Artifact struct {
	// Image is the immutable reference the instance runs.
	Image string
	// Digest is reported as FunctionVersion.image_digest.
	Digest string
	// RootfsBytes is the size of the built root filesystem, when there is one.
	RootfsBytes int64
	Argv        []string
	Env         map[string]string
	WorkingDir  string
	Protocol    supervisorv1.Protocol
	VCPUs       uint32
	MemoryMiB   uint32
}

// Driver turns function versions into runnable instances on one host.
type Driver interface {
	// Build prepares everything needed to start a instance for spec.
	Build(ctx context.Context, spec *functionsv1.FunctionSpec) (*Artifact, error)
	// Acquire returns a started instance ready to take one invocation.
	Acquire(ctx context.Context, a *Artifact) (Instance, functionsv1.StartKind, error)
	// Info describes the host-side pieces the driver runs with.
	Info(ctx context.Context) HostInfo
}

// Instance is one running instance of a function version.
type Instance interface {
	// ID identifies the instance for the life of the host process.
	ID() string
	// Invoke runs one invocation, writing the function's stderr to logs as
	// it arrives.
	Invoke(ctx context.Context, req *supervisorv1.InvokeRequest, logs io.Writer) (*supervisorv1.InvokeResult, error)
	// Release destroys the instance.
	Release(ctx context.Context)
}

// HostInfo is what the driver knows about its host.
type HostInfo struct {
	FirecrackerVersion string
	Kernel             string
	RootfsCacheBytes   int64
	RootfsCacheImages  int32
}

// SupervisorProtocol maps the public protocol enum onto the supervisor's.
func SupervisorProtocol(p functionsv1.InvocationProtocol) supervisorv1.Protocol {
	switch p {
	case functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_EXEC:
		return supervisorv1.Protocol_PROTOCOL_EXEC
	case functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_RUNTIME_API:
		return supervisorv1.Protocol_PROTOCOL_RUNTIME_API
	default:
		return supervisorv1.Protocol_PROTOCOL_UNSPECIFIED
	}
}

// StartRequest is the supervisor configuration for a.
func (a *Artifact) StartRequest() *supervisorv1.StartRequest {
	return &supervisorv1.StartRequest{
		Argv:       a.Argv,
		Env:        a.Env,
		WorkingDir: a.WorkingDir,
		Protocol:   a.Protocol,
	}
}
