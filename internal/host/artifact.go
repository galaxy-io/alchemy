package host

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"maps"
	"slices"
	"strings"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
	"github.com/galaxy-io/alchemy/internal/driver"
)

// artifactID hashes the version an artifact was built for and everything
// that went into it. Every version is its own artifact, with its own
// instances and snapshot, even when its spec matches another's. The image
// digest is in it rather than the tag, so a moved tag is a new artifact.
// Secrets are in it by name only: the values are fetched per invocation and
// never part of the artifact.
func artifactID(a *hostv1.Artifact) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "%s\x00%s\x00%d\x00", a.GetTenantId(), a.GetFunctionId(), a.GetVersion())
	fmt.Fprintf(&sb, "%s\x00%s\x00", a.GetDigest(), a.GetWorkingDir())
	fmt.Fprintf(&sb, "%d\x00%d\x00%d\x00", a.GetProtocol(), a.GetVcpus(), a.GetMemoryMib())
	for _, arg := range a.GetArgv() {
		sb.WriteString(arg)
		sb.WriteByte(0)
	}
	sb.WriteByte(1)
	for _, k := range slices.Sorted(maps.Keys(a.GetEnv())) {
		fmt.Fprintf(&sb, "%s=%s\x00", k, a.GetEnv()[k])
	}
	sb.WriteByte(1)
	for _, l := range a.GetLayers() {
		sb.WriteString(l.GetSha256())
		sb.WriteByte(0)
	}
	sb.WriteByte(1)
	for _, k := range slices.Sorted(maps.Keys(a.GetSecrets())) {
		fmt.Fprintf(&sb, "%s=%s\x00", k, a.GetSecrets()[k])
	}
	sum := sha256.Sum256([]byte(sb.String()))
	return hex.EncodeToString(sum[:16])
}

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
	p.Id = artifactID(p)
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
