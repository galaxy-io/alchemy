package server

import (
	"context"
	"errors"
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
}

// NewMetricsService returns the metrics handler, scoped to each request's
// tenant.
func (s *Service) NewMetricsService() *MetricsService {
	return &MetricsService{store: s.store}
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
