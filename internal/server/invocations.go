package server

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
)

// GetInvocation returns one invocation.
func (s *Service) GetInvocation(ctx context.Context, req *connect.Request[functionsv1.GetInvocationRequest]) (*connect.Response[functionsv1.GetInvocationResponse], error) {
	inv, err := s.invocation(ctx, req.Msg.GetId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&functionsv1.GetInvocationResponse{Invocation: inv}), nil
}

// invocation finds one invocation: in the database, or on the server
// holding it while it runs or until its record is written.
func (s *Service) invocation(ctx context.Context, id string) (*functionsv1.Invocation, error) {
	row, err := s.store.GetInvocation(ctx, sqlcgen.GetInvocationParams{TenantID: s.tenant, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		if inv := s.trackedBy(ctx, id); inv != nil && inv.GetTenantId() == s.tenant {
			return inv, nil
		}
	}
	if err != nil {
		return nil, notFound(err, "invocation %q not found", id)
	}
	return invocationProto(row), nil
}

// ListInvocations pages through invocations, newest first, optionally
// filtered by function and status.
func (s *Service) ListInvocations(ctx context.Context, req *connect.Request[functionsv1.ListInvocationsRequest]) (*connect.Response[functionsv1.ListInvocationsResponse], error) {
	pg, err := pageFor(req.Msg.GetPagination())
	if err != nil {
		return nil, err
	}
	statuses := make([]string, 0, len(req.Msg.GetStatuses()))
	for _, want := range req.Msg.GetStatuses() {
		row, ok := invocationStatusRow(want)
		if !ok {
			return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("statuses contains an invalid status"))
		}
		statuses = append(statuses, string(row))
	}
	startKinds := make([]string, 0, len(req.Msg.GetStartKinds()))
	for _, want := range req.Msg.GetStartKinds() {
		row := startKindRow(want)
		if !row.Valid {
			return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("start_kinds contains an invalid start kind"))
		}
		startKinds = append(startKinds, string(row.StartKind))
	}
	functionIDs := req.Msg.GetFunctionIds()
	if functionIDs == nil {
		functionIDs = []string{}
	}
	since, until := nullMillis(req.Msg.GetSinceMs()), nullMillis(req.Msg.GetUntilMs())

	rows, err := s.store.ListInvocations(ctx, sqlcgen.ListInvocationsParams{
		TenantID: s.tenant, FunctionIds: functionIDs, Statuses: statuses, StartKinds: startKinds,
		Since: since, Until: until, RowLimit: pg.limit, RowOffset: pg.offset,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	total, err := s.store.CountInvocations(ctx, sqlcgen.CountInvocationsParams{
		TenantID: s.tenant, FunctionIds: functionIDs, Statuses: statuses, StartKinds: startKinds,
		Since: since, Until: until,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	resp := &functionsv1.ListInvocationsResponse{Pagination: pg.response(len(rows), total)}
	for _, row := range rows {
		resp.Invocations = append(resp.Invocations, invocationProto(row))
	}
	return connect.NewResponse(resp), nil
}

// TailInvocations streams invocation transitions, from every server, until
// the client goes away. With should_replay, every active invocation is sent
// first.
func (s *Service) TailInvocations(ctx context.Context, req *connect.Request[functionsv1.TailInvocationsRequest], stream *connect.ServerStream[functionsv1.TailInvocationsResponse]) error {
	if req.Msg.GetShouldReplay() {
		active, err := s.trackedAnywhere(ctx, req.Msg.GetFunctionId())
		if err != nil {
			return connect.NewError(connect.CodeUnavailable, err)
		}
		for _, inv := range active {
			if terminal(inv.GetStatus()) || inv.GetTenantId() != s.tenant {
				continue
			}
			if err := stream.Send(&functionsv1.TailInvocationsResponse{
				Invocation: inv, EventType: eventType(inv.GetStatus()), Replay: true, EmittedAt: inv.GetCreatedAt(),
			}); err != nil {
				return err
			}
		}
	}
	return s.tail(ctx, req.Msg.GetFunctionId(), func(inv *functionsv1.Invocation) error {
		if inv.GetTenantId() != s.tenant {
			return nil
		}
		return stream.Send(&functionsv1.TailInvocationsResponse{
			Invocation: inv, EventType: eventType(inv.GetStatus()), EmittedAt: time.Now().UnixMilli(),
		})
	})
}
