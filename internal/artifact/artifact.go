// Package artifact names artifacts. Hosts name what they build and servers
// name what an invocation should run with the same function, so a function
// whose resources change runs as a new artifact on every host.
package artifact

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"maps"
	"slices"
	"strings"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
)

// ID hashes the version an artifact was built for and everything
// that went into it. Every version is its own artifact, with its own
// instances and snapshot, even when its spec matches another's. The image
// digest is in it rather than the tag, so a moved tag is a new artifact.
// Secrets are in it by name only: the values are fetched per invocation and
// never part of the artifact.
func ID(a *hostv1.Artifact) string {
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
