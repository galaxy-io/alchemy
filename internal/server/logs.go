package server

import (
	"context"
	"time"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/logs"
)

// GetInvocationLogs streams an invocation's stderr. A finished invocation's
// log comes from the log bucket. One still running, or whose upload has not
// completed, comes from the bus, which holds only its latest lines.
func (s *Service) GetInvocationLogs(ctx context.Context, req *connect.Request[functionsv1.GetInvocationLogsRequest], stream *connect.ServerStream[functionsv1.GetInvocationLogsResponse]) error {
	inv, err := s.invocation(ctx, req.Msg.GetId())
	if err != nil {
		return err
	}
	send := func(p []byte) error {
		return stream.Send(&functionsv1.GetInvocationLogsResponse{Data: p})
	}

	if inv.GetEndedAt() != 0 {
		found, err := logs.Read(ctx, s.logs, logs.Key(inv.GetTenantId(), inv.GetFunctionId(), time.UnixMilli(inv.GetCreatedAt()), inv.GetId()), sendWriter(send))
		if found {
			return err
		}
		if err != nil {
			s.log.Warn("read log from bucket", "invocation_id", inv.GetId(), "err", err)
		}
	}

	ended := func() bool {
		inv, err := s.invocation(ctx, inv.GetId())
		return err != nil || inv.GetEndedAt() != 0
	}
	return s.bus.ReadLog(ctx, bus.LogSubject(inv.GetTenantId(), inv.GetId()), req.Msg.GetFollow() && inv.GetEndedAt() == 0, ended, send)
}

// sendWriter sends each write as one message.
type sendWriter func([]byte) error

func (w sendWriter) Write(p []byte) (int, error) {
	if err := w(p); err != nil {
		return 0, err
	}
	return len(p), nil
}
