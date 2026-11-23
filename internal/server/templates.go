package server

import (
	"context"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/templates"
)

// ListTemplates returns the templates a function can be built from.
func (s *Service) ListTemplates(_ context.Context, _ *connect.Request[functionsv1.ListTemplatesRequest]) (*connect.Response[functionsv1.ListTemplatesResponse], error) {
	list, err := templates.List()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&functionsv1.ListTemplatesResponse{Templates: list}), nil
}
