package server

import (
	"context"
	"errors"
	"slices"
	"time"

	"connectrpc.com/connect"

	metricsv1 "github.com/galaxy-io/alchemy/api/metrics/v1"
	"github.com/galaxy-io/alchemy/api/metrics/v1/metricsv1connect"
	"github.com/galaxy-io/alchemy/datastore/postgres"
)

// maxMetricsWindow bounds how far back a single query may reach.
const maxMetricsWindow = 90 * 24 * time.Hour

// MetricsService serves metrics.v1 over the invocations table.
type MetricsService struct {
	metricsv1connect.UnimplementedMetricsServiceHandler

	store *postgres.Store
	svc   *Service
}

// NewMetricsService returns the metrics handler, scoped to each request's
// tenant.
func (s *Service) NewMetricsService() *MetricsService {
	return &MetricsService{store: s.store, svc: s}
}

// GetQueue counts what is in flight now. The queue holds an invocation from
// when it is accepted until it is done, so what it holds less what hosts
// report running is what waits to start.
func (m *MetricsService) GetQueue(ctx context.Context, req *connect.Request[metricsv1.GetQueueRequest]) (*connect.Response[metricsv1.GetQueueResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	inFlight, err := m.svc.queue.InFlight(ctx, tenant)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnavailable, err)
	}
	wanted := func(string) bool { return true }
	if ids := req.Msg.GetFunctionIds(); len(ids) > 0 {
		wanted = func(id string) bool { return slices.Contains(ids, id) }
	}
	var held, running int64
	for id, n := range inFlight {
		if wanted(id) {
			held += int64(n)
		}
	}
	m.svc.mu.Lock()
	for _, k := range m.svc.hosts {
		if time.Since(k.seen) > m.svc.cfg.HostTTL {
			continue
		}
		for _, r := range k.running {
			if r.GetTenantId() == tenant && wanted(r.GetFunctionId()) {
				running += int64(r.GetCount())
			}
		}
	}
	m.svc.mu.Unlock()
	return connect.NewResponse(&metricsv1.GetQueueResponse{Queued: max(held-running, 0), Running: running}), nil
}

// QueryTimeseries returns bucketed metrics over a window.
func (m *MetricsService) QueryTimeseries(ctx context.Context, req *connect.Request[metricsv1.QueryTimeseriesRequest]) (*connect.Response[metricsv1.QueryTimeseriesResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	since, until, err := window(req.Msg.GetSinceMs(), req.Msg.GetUntilMs())
	if err != nil {
		return nil, err
	}
	series, err := m.store.QueryTimeseries(ctx, postgres.TimeseriesQuery{
		MetricsQuery: postgres.MetricsQuery{
			Tenant:  tenant,
			Metrics: req.Msg.GetMetrics(),
			Since:   since,
			Until:   until,
			GroupBy: req.Msg.GetGroupBy(),
			Filters: req.Msg.GetFilters(),
		},
		Granularity:     req.Msg.GetGranularity(),
		TZOffsetMinutes: req.Msg.GetTzOffsetMinutes(),
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&metricsv1.QueryTimeseriesResponse{Series: series}), nil
}

// QueryAggregate returns one row per group over a window.
func (m *MetricsService) QueryAggregate(ctx context.Context, req *connect.Request[metricsv1.QueryAggregateRequest]) (*connect.Response[metricsv1.QueryAggregateResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	since, until, err := window(req.Msg.GetSinceMs(), req.Msg.GetUntilMs())
	if err != nil {
		return nil, err
	}
	rows, err := m.store.QueryAggregate(ctx, postgres.MetricsQuery{
		Tenant:  tenant,
		Metrics: req.Msg.GetMetrics(),
		Since:   since,
		Until:   until,
		GroupBy: req.Msg.GetGroupBy(),
		Filters: req.Msg.GetFilters(),
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&metricsv1.QueryAggregateResponse{Rows: rows}), nil
}

func window(sinceMs, untilMs int64) (time.Time, time.Time, error) {
	if sinceMs <= 0 {
		return time.Time{}, time.Time{}, connect.NewError(connect.CodeInvalidArgument, errors.New("since_ms is required"))
	}
	since := time.UnixMilli(sinceMs)
	until := time.Now()
	if untilMs > 0 {
		until = time.UnixMilli(untilMs)
	}
	switch {
	case !until.After(since):
		return time.Time{}, time.Time{}, connect.NewError(connect.CodeInvalidArgument, errors.New("until_ms must be after since_ms"))
	case until.Sub(since) > maxMetricsWindow:
		return time.Time{}, time.Time{}, connect.NewError(connect.CodeInvalidArgument, errors.New("window exceeds 90 days"))
	}
	return since, until, nil
}
