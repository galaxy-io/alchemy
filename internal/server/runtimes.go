package server

import (
	"context"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/runtimes"
)

// ListRuntimes returns the runtimes a function can be built from source on,
// and the limits a source is held to.
func (s *Service) ListRuntimes(_ context.Context, _ *connect.Request[functionsv1.ListRuntimesRequest]) (*connect.Response[functionsv1.ListRuntimesResponse], error) {
	return connect.NewResponse(&functionsv1.ListRuntimesResponse{
		Runtimes: runtimes.List(s.cfg.RuntimeImagePrefix, s.cfg.RuntimeIconBaseURL),
		Limits:   &functionsv1.SourceLimits{MaxFiles: maxSourceFiles, MaxBytes: maxSourceBytes},
	}), nil
}
