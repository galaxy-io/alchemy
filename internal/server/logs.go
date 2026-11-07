package server

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/logs"
)

// GetInvocationLogs streams an invocation's stderr, of one attempt when it
// ran more than once. An attempt that ended has its log in the log bucket.
// One still running, or whose upload has not completed, comes from the bus,
// which holds only its latest lines.
func (s *Service) GetInvocationLogs(ctx context.Context, req *connect.Request[functionsv1.GetInvocationLogsRequest], stream *connect.ServerStream[functionsv1.GetInvocationLogsResponse]) error {
	inv, err := s.invocation(ctx, req.Msg.GetId())
	if err != nil {
		return err
	}
	latest := max(inv.GetAttempts(), 1)
	attempt := req.Msg.GetAttempt()
	switch {
	case attempt == 0:
		attempt = latest
	case attempt < 0 || attempt > latest:
		return connect.NewError(connect.CodeNotFound, fmt.Errorf("invocation %q has no attempt %d", inv.GetId(), attempt))
	}
	send := func(p []byte) error {
		return stream.Send(&functionsv1.GetInvocationLogsResponse{Data: p})
	}

	if attemptEnded(inv, attempt) {
		key := logs.AttemptKey(logs.Key(inv.GetTenantId(), inv.GetFunctionId(), time.UnixMilli(inv.GetCreatedAt()), inv.GetId()), attempt)
		found, err := logs.Read(ctx, s.logs, key, sendWriter(send))
		if found {
			return err
		}
		if err != nil {
			s.log.Warn("read log from bucket", "invocation_id", inv.GetId(), "attempt", attempt, "err", err)
		}
	}

	ended := func() bool {
		inv, err := s.invocation(ctx, inv.GetId())
		return err != nil || attemptEnded(inv, attempt)
	}
	follow := req.Msg.GetFollow() && !attemptEnded(inv, attempt)
	return s.bus.ReadLog(ctx, bus.AttemptLogSubject(inv.GetTenantId(), inv.GetId(), attempt), follow, ended, send)
}

// attemptEnded reports whether inv's attempt is over: the invocation ended,
// a later attempt started, or the attempt failed and the next waits.
func attemptEnded(inv *functionsv1.Invocation, attempt int32) bool {
	return inv.GetEndedAt() != 0 || attempt < inv.GetAttempts() ||
		(inv.GetStatus() == functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING && attempt == inv.GetAttempts())
}

// sendWriter sends each write as one message.
type sendWriter func([]byte) error

func (w sendWriter) Write(p []byte) (int, error) {
	if err := w(p); err != nil {
		return 0, err
	}
	return len(p), nil
}
