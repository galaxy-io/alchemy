package host

import (
	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
	"github.com/galaxy-io/alchemy/internal/artifact"
	"github.com/galaxy-io/alchemy/internal/driver"
)

// toProto turns a built artifact into its wire form and assigns its id,
// with the layers it was built with and the contract its invocations are
// checked against from the request.
func toProto(req *hostv1.BuildRequest, a *driver.Artifact) *hostv1.Artifact {
	p := &hostv1.Artifact{
		TenantId:    req.GetTenantId(),
		FunctionId:  req.GetFunctionId(),
		Version:     req.GetVersion(),
		Image:       a.Image,
		Digest:      a.Digest,
		RootfsBytes: a.RootfsBytes,
		Argv:        a.Argv,
		Env:         a.Env,
		WorkingDir:  a.WorkingDir,
		Protocol:    protocolProto(a.Protocol),
		Vcpus:       a.VCPUs,
		MemoryMib:   a.MemoryMiB,
		Layers:      req.GetLayers(),
		Contract:    req.GetSpec().GetContract(),
		Secrets:     req.GetSpec().GetSecrets(),
	}
	p.Id = artifact.ID(p)
	return p
}

// fromProto is the driver's view of a wire artifact.
func fromProto(p *hostv1.Artifact) *driver.Artifact {
	return &driver.Artifact{
		ID:          p.GetId(),
		Image:       p.GetImage(),
		Digest:      p.GetDigest(),
		Layers:      layerDigests(p.GetLayers()),
		RootfsBytes: p.GetRootfsBytes(),
		Argv:        p.GetArgv(),
		Env:         p.GetEnv(),
		WorkingDir:  p.GetWorkingDir(),
		Protocol:    driver.SupervisorProtocol(p.GetProtocol()),
		VCPUs:       p.GetVcpus(),
		MemoryMiB:   p.GetMemoryMib(),
	}
}

func protocolProto(p supervisorv1.Protocol) functionsv1.InvocationProtocol {
	switch p {
	case supervisorv1.Protocol_PROTOCOL_EXEC:
		return functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_EXEC
	case supervisorv1.Protocol_PROTOCOL_RUNTIME_API:
		return functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_RUNTIME_API
	default:
		return functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_UNSPECIFIED
	}
}

func layerDigests(layers []*hostv1.Layer) []string {
	out := make([]string, len(layers))
	for i, l := range layers {
		out[i] = l.GetSha256()
	}
	return out
}
