package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	metricsv1 "github.com/galaxy-io/alchemy/api/metrics/v1"
)

// Metrics queries aggregate invocations by metric and dimension. The SQL is
// assembled from vetted fragments only; every user value is a bound
// parameter.

// metricExprs maps each metric onto its aggregate. Durations average the
// phases that happened: nullif routes zero (phase never ran) through avg()'s
// NULL-ignoring path.
var metricExprs = map[metricsv1.Metric]string{
	metricsv1.Metric_METRIC_INVOCATION_COUNT:            "count(*)",
	metricsv1.Metric_METRIC_INVOCATION_ACQUIRE_DURATION: "avg(nullif(acquire_us, 0)) / 1000",
	metricsv1.Metric_METRIC_INVOCATION_RUN_DURATION:     "avg(nullif(run_us, 0)) / 1000",
	metricsv1.Metric_METRIC_INVOCATION_TOTAL_DURATION:   "avg(nullif(total_us, 0)) / 1000",
	metricsv1.Metric_METRIC_INVOCATION_INPUT_BYTES:      "sum(input_bytes)",
	metricsv1.Metric_METRIC_INVOCATION_OUTPUT_BYTES:     "sum(output_bytes)",
}

var dimensionColumns = map[metricsv1.MetricDimension]string{
	metricsv1.MetricDimension_METRIC_DIMENSION_TENANT_ID:   "tenant_id",
	metricsv1.MetricDimension_METRIC_DIMENSION_FUNCTION_ID: "function_id",
	metricsv1.MetricDimension_METRIC_DIMENSION_STATUS:      "status",
	metricsv1.MetricDimension_METRIC_DIMENSION_START_KIND:  "start_kind",
}

var granularityUnits = map[metricsv1.MetricGranularity]string{
	metricsv1.MetricGranularity_METRIC_GRANULARITY_MINUTE: "minute",
	metricsv1.MetricGranularity_METRIC_GRANULARITY_HOUR:   "hour",
	metricsv1.MetricGranularity_METRIC_GRANULARITY_DAY:    "day",
}

// MetricsQuery is the window and shape shared by both query kinds.
type MetricsQuery struct {
	Tenant  string
	Metrics []metricsv1.Metric
	Since   time.Time
	Until   time.Time
	GroupBy metricsv1.MetricDimension
	Filters []*metricsv1.MetricFilter
}

// TimeseriesQuery adds bucketing to a MetricsQuery.
type TimeseriesQuery struct {
	MetricsQuery
	Granularity     metricsv1.MetricGranularity
	TZOffsetMinutes int32
}

type queryBuilder struct {
	args []any
}

func (b *queryBuilder) arg(v any) string {
	b.args = append(b.args, v)
	return fmt.Sprintf("$%d", len(b.args))
}

func metricList(ms []metricsv1.Metric) ([]string, error) {
	if len(ms) == 0 {
		return nil, fmt.Errorf("metrics: at least one metric is required")
	}
	exprs := make([]string, len(ms))
	for i, m := range ms {
		expr, ok := metricExprs[m]
		if !ok {
			return nil, fmt.Errorf("metrics: unsupported metric %s", m)
		}
		exprs[i] = expr
	}
	return exprs, nil
}

// where scopes by tenant and window and applies dimension filters. Enum
// columns are compared as text so wire tokens match without a cast.
func (b *queryBuilder) where(q MetricsQuery) string {
	var s strings.Builder
	fmt.Fprintf(&s, "WHERE tenant_id = %s AND created_at >= %s AND created_at < %s", b.arg(q.Tenant), b.arg(q.Since), b.arg(q.Until))
	for _, f := range q.Filters {
		col, ok := dimensionColumns[f.GetDimension()]
		if !ok || len(f.GetValues()) == 0 {
			continue
		}
		fmt.Fprintf(&s, " AND %s::text = ANY(%s::text[])", col, b.arg(f.GetValues()))
	}
	return s.String()
}

// keyExpr is the group key. A nullable dimension (start_kind before the
// instance is acquired) groups under ” rather than failing the scan.
func keyExpr(dim metricsv1.MetricDimension) (expr string, grouped bool) {
	col, ok := dimensionColumns[dim]
	if !ok {
		return "''", false
	}
	return fmt.Sprintf("coalesce(%s::text, '')", col), true
}

// groupKeys returns the series the caller asked for explicitly: when a
// filter covers the group-by dimension, its values fix which series exist
// and their order, so an empty one still comes back zero-filled.
func groupKeys(q MetricsQuery) []string {
	for _, f := range q.Filters {
		if f.GetDimension() == q.GroupBy && len(f.GetValues()) > 0 {
			return f.GetValues()
		}
	}
	return nil
}

// QueryAggregate returns one row per group over the window.
func (s *Store) QueryAggregate(ctx context.Context, q MetricsQuery) ([]*metricsv1.AggregateRow, error) {
	exprs, err := metricList(q.Metrics)
	if err != nil {
		return nil, err
	}
	b := &queryBuilder{}
	where := b.where(q)
	key, grouped := keyExpr(q.GroupBy)
	sql := fmt.Sprintf("SELECT %s AS key, %s FROM invocations %s", key, strings.Join(exprs, ", "), where)
	if grouped {
		sql += " GROUP BY key ORDER BY key"
	}

	rows, err := s.pool.Query(ctx, sql, b.args...)
	if err != nil {
		return nil, fmt.Errorf("metrics: aggregate: %w", err)
	}
	defer rows.Close()

	var out []*metricsv1.AggregateRow
	for rows.Next() {
		var row metricsv1.AggregateRow
		values := make([]*float64, len(exprs))
		if err := rows.Scan(scanTargets(&row.Key, values)...); err != nil {
			return nil, fmt.Errorf("metrics: scan aggregate: %w", err)
		}
		row.Values = valuesOrZero(values)
		out = append(out, &row)
	}
	return out, rows.Err()
}

// QueryTimeseries returns one dense, zero-filled, ascending series per
// group, bucketed at q.Granularity over [Since, Until).
func (s *Store) QueryTimeseries(ctx context.Context, q TimeseriesQuery) ([]*metricsv1.Timeseries, error) {
	exprs, err := metricList(q.Metrics)
	if err != nil {
		return nil, err
	}
	unit, ok := granularityUnits[q.Granularity]
	if !ok {
		return nil, fmt.Errorf("metrics: granularity is required")
	}
	b := &queryBuilder{}
	where := b.where(q.MetricsQuery)
	key, grouped := keyExpr(q.GroupBy)

	// Buckets are computed in the viewer's offset so DAY lines up with their
	// calendar day; `to` backs off a microsecond so an exclusive end that
	// lands on a boundary does not add a bucket.
	tz := fmt.Sprintf("(%s * interval '1 minute')", b.arg(q.TZOffsetMinutes))
	bucketExpr := fmt.Sprintf("date_trunc('%s', created_at + %s) - %s", unit, tz, tz)
	bucketFrom := fmt.Sprintf("date_trunc('%s', %s::timestamptz + %s) - %s", unit, b.arg(q.Since), tz, tz)
	bucketTo := fmt.Sprintf("date_trunc('%s', (%s::timestamptz - interval '1 microsecond') + %s) - %s", unit, b.arg(q.Until), tz, tz)

	aggSelect := make([]string, len(exprs))
	aggCols := make([]string, len(exprs))
	for i, e := range exprs {
		aggSelect[i] = fmt.Sprintf("%s AS m%d", e, i)
		aggCols[i] = fmt.Sprintf("agg.m%d", i)
	}

	groupsSQL := "SELECT key, row_number() OVER (ORDER BY key) AS ord FROM (SELECT DISTINCT key FROM filtered"
	if !grouped {
		groupsSQL += " UNION SELECT ''"
	}
	groupsSQL += ") d"
	if keys := groupKeys(q.MetricsQuery); len(keys) > 0 {
		groupsSQL = fmt.Sprintf("SELECT key, ord FROM unnest(%s::text[]) WITH ORDINALITY AS g(key, ord)", b.arg(keys))
	}

	sql := fmt.Sprintf(`
WITH filtered AS (
  SELECT %s AS key, %s AS bucket, acquire_us, run_us, total_us, input_bytes, output_bytes
  FROM invocations %s
),
buckets AS (SELECT generate_series(%s, %s, interval '1 %s') AS bucket),
groups AS (%s),
spine AS (SELECT buckets.bucket, groups.key, groups.ord FROM buckets CROSS JOIN groups),
agg AS (SELECT key, bucket, %s FROM filtered GROUP BY key, bucket)
SELECT spine.key, spine.bucket, %s
FROM spine LEFT JOIN agg ON agg.key = spine.key AND agg.bucket = spine.bucket
ORDER BY spine.ord, spine.bucket`,
		key, bucketExpr, where, bucketFrom, bucketTo, unit, groupsSQL,
		strings.Join(aggSelect, ", "), strings.Join(aggCols, ", "))

	rows, err := s.pool.Query(ctx, sql, b.args...)
	if err != nil {
		return nil, fmt.Errorf("metrics: timeseries: %w", err)
	}
	defer rows.Close()
	return scanTimeseries(rows, len(exprs))
}

func scanTimeseries(rows pgx.Rows, numMetrics int) ([]*metricsv1.Timeseries, error) {
	byKey := map[string]*metricsv1.Timeseries{}
	var out []*metricsv1.Timeseries
	for rows.Next() {
		var key string
		var bucket time.Time
		values := make([]*float64, numMetrics)
		if err := rows.Scan(append([]any{&key, &bucket}, scanTargets(nil, values)[1:]...)...); err != nil {
			return nil, fmt.Errorf("metrics: scan timeseries: %w", err)
		}
		ts, ok := byKey[key]
		if !ok {
			ts = &metricsv1.Timeseries{Key: key}
			byKey[key] = ts
			out = append(out, ts)
		}
		ts.Points = append(ts.Points, &metricsv1.TimeseriesPoint{
			BucketStartMs: bucket.UnixMilli(),
			Values:        valuesOrZero(values),
		})
	}
	return out, rows.Err()
}

// scanTargets returns Scan destinations: the key, then one nullable target
// per metric (avg() over an empty group is NULL).
func scanTargets(key *string, values []*float64) []any {
	targets := make([]any, 0, len(values)+1)
	targets = append(targets, key)
	for i := range values {
		targets = append(targets, &values[i])
	}
	return targets
}

func valuesOrZero(nullable []*float64) []float64 {
	out := make([]float64, len(nullable))
	for i, v := range nullable {
		if v != nil {
			out[i] = *v
		}
	}
	return out
}
