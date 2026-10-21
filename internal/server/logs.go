package server

import (
	"context"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/logs"
)

// GetInvocationLogs streams an invocation's stderr. A finished invocation's
// log comes from the log bucket. One still running, or whose upload has not
// completed, comes from the bus, which holds only its latest lines.
func (s *Service) GetInvocationLogs(ctx context.Context, req *connect.Request[functionsv1.GetInvocationLogsRequest], stream *connect.ServerStream[functionsv1.GetInvocationLogsResponse]) error {
	params := sqlcgen.GetInvocationParams{TenantID: s.tenant, ID: req.Msg.GetId()}
	row, err := s.store.GetInvocation(ctx, params)
	if err != nil {
		return notFound(err, "invocation %q not found", req.Msg.GetId())
	}
	send := func(p []byte) error {
		return stream.Send(&functionsv1.GetInvocationLogsResponse{Data: p})
	}

	if row.EndedAt.Valid {
		found, err := logs.Read(ctx, s.logs, logs.Key(row.TenantID, row.ID), sendWriter(send))
		if found {
			return err
		}
		if err != nil {
			s.log.Warn("read log from bucket", "invocation_id", row.ID, "err", err)
		}
	}

	ended := func() bool {
		row, err := s.store.GetInvocation(ctx, params)
		return err != nil || row.EndedAt.Valid
	}
	return s.bus.ReadLog(ctx, bus.LogSubject(row.TenantID, row.ID), req.Msg.GetFollow() && !row.EndedAt.Valid, ended, send)
}

// sendWriter sends each write as one message.
type sendWriter func([]byte) error

func (w sendWriter) Write(p []byte) (int, error) {
	if err := w(p); err != nil {
		return 0, err
	}
	return len(p), nil
}
