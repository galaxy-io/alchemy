package server

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
)

// GetInvocation returns one invocation record.
func (s *Service) GetInvocation(ctx context.Context, req *connect.Request[functionsv1.GetInvocationRequest]) (*connect.Response[functionsv1.GetInvocationResponse], error) {
	row, err := s.store.GetInvocation(ctx, sqlcgen.GetInvocationParams{TenantID: s.tenant, ID: req.Msg.GetId()})
	if err != nil {
		return nil, notFound(err, "invocation %q not found", req.Msg.GetId())
	}
	return connect.NewResponse(&functionsv1.GetInvocationResponse{Invocation: invocationProto(row)}), nil
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

// TailInvocations streams invocation transitions until the client goes
// away. With should_replay, every active invocation is sent first.
func (s *Service) TailInvocations(ctx context.Context, req *connect.Request[functionsv1.TailInvocationsRequest], stream *connect.ServerStream[functionsv1.TailInvocationsResponse]) error {
	sub := s.events.subscribe(req.Msg.GetFunctionId())
	defer s.events.unsubscribe(sub)

	if req.Msg.GetShouldReplay() {
		active, err := s.store.ListActiveInvocations(ctx, sqlcgen.ListActiveInvocationsParams{
			TenantID: s.tenant, FunctionID: nullUUID(req.Msg.GetFunctionId()),
		})
		if err != nil {
			return connect.NewError(connect.CodeInternal, err)
		}
		for _, row := range active {
			inv := invocationProto(row)
			if err := stream.Send(&functionsv1.TailInvocationsResponse{
				Invocation: inv, EventType: eventType(inv.GetStatus()), Replay: true, EmittedAt: inv.GetCreatedAt(),
			}); err != nil {
				return err
			}
		}
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case ev := <-sub.ch:
			if err := stream.Send(ev); err != nil {
				return err
			}
		}
	}
}
