package server

import (
	"context"
	"errors"
	"time"

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
// and the version gets the compiled files instead of the source. The host
// keeps the compiled layer by the build image's digest and the source's, so
// the same files on the same build image compile once.
func (s *Service) versionLayers(ctx context.Context, v *sqlcgen.FunctionVersion, spec *functionsv1.FunctionSpec) ([]*hostv1.Layer, string, error) {
	source := sourceLayers(spec)
	buildImage := runtimes.BuildImage(s.cfg.RuntimeImagePrefix, spec.GetImage())
	if buildImage == "" || len(source) == 0 {
		return source, "", nil
	}
	req := &hostv1.CompileRequest{
		TenantId:  v.TenantID,
		Image:     buildImage,
		Source:    source[0],
		TimeoutMs: compileTimeout.Milliseconds(),
		Vcpus:     compileVCPUs,
		MemoryMib: compileMemoryMiB,
	}
	// The least busy host that has room compiles. A compile that fails is
	// the source's fault and is not tried elsewhere.
	err := errNoHosts
	for _, name := range s.hostsByLoad() {
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
