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
	// ID is the host's id for the artifact, which keys its snapshot.
	ID string
	// Image is the immutable reference the instance runs.
	Image string
	// Digest is reported as FunctionVersion.image_digest.
	Digest string
	// Layers are the digests of the layers extracted over the image, in order.
	Layers []string
	// RootfsBytes is the size of the built root filesystem, when there is one.
	RootfsBytes int64
	Argv        []string
	Env         map[string]string
	WorkingDir  string
	Protocol    supervisorv1.Protocol
	VCPUs       uint32
	MemoryMiB   uint32
	// Egress gives the instance outbound network access.
	Egress bool
}

// Driver turns function versions into runnable instances on one host.
type Driver interface {
	// Build prepares everything needed to start a instance for spec, sized
	// by resources, with layers extracted over its image in order.
	Build(ctx context.Context, spec *functionsv1.FunctionSpec, resources *functionsv1.Resources, layers []Layer) (*Artifact, error)
	// Snapshot boots a once, starts it and keeps its state, so Acquire
	// restores it instead of booting. A driver without snapshots does
	// nothing.
	Snapshot(ctx context.Context, a *Artifact) error
	// Acquire returns a started instance ready to take one invocation.
	Acquire(ctx context.Context, a *Artifact) (Instance, functionsv1.StartKind, error)
	// Forget drops what was kept for a: its snapshot, and its drives unless
	// an artifact in keep shares them. Running instances keep what they
	// hold.
	Forget(ctx context.Context, a *Artifact, keep []*Artifact) error
	// Info describes the host-side pieces the driver runs with.
	Info(ctx context.Context) HostInfo
}

// Layer is a tar archive, plain or gzipped, extracted over an image.
type Layer struct {
	// SHA256 is the archive's content digest, in hex.
	SHA256 string
	// Open reads the archive. Build only calls it when it has no root
	// filesystem for the image and layers yet.
	Open func(ctx context.Context) (io.ReadCloser, error)
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
