package server

import (
	"context"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/version"
)

// GetVersion returns the build the server runs.
func (s *Service) GetVersion(_ context.Context, _ *connect.Request[functionsv1.GetVersionRequest]) (*connect.Response[functionsv1.GetVersionResponse], error) {
	return connect.NewResponse(&functionsv1.GetVersionResponse{
		Version: version.Version,
		Commit:  version.Commit,
		Date:    version.Date,
	}), nil
}
