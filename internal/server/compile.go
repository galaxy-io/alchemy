package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"gocloud.dev/gcerrors"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/runtimes"
)

// A compile runs in a microVM of its own, sized for a compiler rather than
// for the function.
const (
	compileTimeout   = 3 * time.Minute
	compileVCPUs     = 2
	compileMemoryMiB = 2048
)

// versionLayers are the layers a version's image gets. A source on a
// runtime that compiles is compiled first, once for all the version's hosts,
// and the version gets the compiled files instead of the source. The
// compiled layer is kept by the build image and the source's digest, so the
// same files on the same build image compile once.
func (s *Service) versionLayers(ctx context.Context, v *sqlcgen.FunctionVersion, spec *functionsv1.FunctionSpec) ([]*hostv1.Layer, string, error) {
	source := sourceLayers(spec)
	buildImage := runtimes.BuildImage(s.cfg.RuntimeImagePrefix, spec.GetImage())
	if buildImage == "" || len(source) == 0 {
		return source, "", nil
	}
	sum := sha256.Sum256([]byte(buildImage + "\x00" + source[0].GetSha256()))
	key := v.TenantID + "/compiled/" + hex.EncodeToString(sum[:]) + ".tar"

	attrs, err := s.artifacts.Attributes(ctx, key)
	switch {
	case err == nil && attrs.Metadata[bus.LayerDigestMetadata] != "":
		return []*hostv1.Layer{{Key: key, Sha256: attrs.Metadata[bus.LayerDigestMetadata]}}, "", nil
	case err != nil && gcerrors.Code(err) != gcerrors.NotFound:
		return nil, "", fmt.Errorf("artifacts bucket: %w", err)
	}

	hosts := s.placedHosts(v.FunctionID)
	if len(hosts) == 0 {
		return nil, "", errNoHosts
	}
	req := &hostv1.CompileRequest{
		TenantId:  v.TenantID,
		Image:     buildImage,
		Source:    source[0],
		Key:       key,
		TimeoutMs: compileTimeout.Milliseconds(),
		Vcpus:     compileVCPUs,
		MemoryMib: compileMemoryMiB,
	}
	// The first placed host that has room compiles. A compile that fails is
	// the source's fault and is not tried elsewhere.
	err = errNoHosts
	for _, name := range hosts {
		resp := &hostv1.CompileResponse{}
		reqCtx, cancel := context.WithTimeout(ctx, compileTimeout+time.Minute)
		rerr := s.bus.Request(reqCtx, bus.HostCompileSubject(name), req, resp)
		cancel()
		switch {
		case rerr != nil:
			err = rerr
			if errors.Is(rerr, bus.ErrNoResponders) {
				err = errNoHosts
			}
			continue
		case resp.GetLayer() != nil:
			return []*hostv1.Layer{resp.GetLayer()}, resp.GetBuildLog(), nil
		}
		switch resp.GetError().GetCode() {
		case "resource_exhausted", "unavailable":
			err = errors.New(resp.GetError().GetMessage())
			continue
		}
		return nil, resp.GetBuildLog(), errors.New(resp.GetError().GetMessage())
	}
	return nil, "", err
}
