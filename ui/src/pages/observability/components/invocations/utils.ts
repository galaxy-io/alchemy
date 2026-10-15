import { create } from "@bufbuild/protobuf";

import type { BarChartGroupDatum } from "@galaxy-io/dls/charts/BarChart";

import {
  Metric,
  MetricDimension,
  MetricFilterSchema,
  type Timeseries,
} from "@/gen/metrics/v1/metrics_pb";

import {
  INVOCATION_SETTLED_STATUSES,
  INVOCATION_STATUS_TO_CHART_PALETTE_MAP,
  INVOCATION_STATUS_TO_LABEL_MAP,
  INVOCATION_STATUS_TO_WIRE_TOKEN_MAP,
} from "@/components/invocations/constants";
import type { InvocationsTimeframe } from "@/components/invocations/types";
import { mapWireTokenToInvocationStatus } from "@/components/invocations/utils";

import type { ObservabilityInvocationsMetric } from "@/pages/observability/components/invocations/types";
import { createObservabilityTimeseriesInput } from "@/pages/observability/utils";

export const createObservabilityInvocationsInput = (
  timeframe: InvocationsTimeframe,
  bucketStartMs: number,
) =>
  createObservabilityTimeseriesInput(timeframe, bucketStartMs, {
    metrics: [Metric.INVOCATION_COUNT],
    groupBy: MetricDimension.STATUS,
    filters: [
      create(MetricFilterSchema, {
        dimension: MetricDimension.STATUS,
        values: INVOCATION_SETTLED_STATUSES.map(
          (status) => INVOCATION_STATUS_TO_WIRE_TOKEN_MAP[status],
        ),
      }),
    ],
  });

export const mapTimeseriesToInvocationsGroups = (
  series: Timeseries[],
): BarChartGroupDatum<ObservabilityInvocationsMetric>[] => {
  const hasInvocations = series.some((statusSeries) =>
    statusSeries.points.some((point) => (point.values[0] ?? 0) > 0),
  );
  if (!hasInvocations) return [];
  return (series[0]?.points ?? []).map((point, bucketIndex) => ({
    label: point.bucketStartMs.toString(),
    bars: [
      {
        metric: "invocations",
        components: series.map((statusSeries) => {
          const status = mapWireTokenToInvocationStatus(statusSeries.key);
          return {
            key: statusSeries.key,
            label: INVOCATION_STATUS_TO_LABEL_MAP[status],
            value: statusSeries.points[bucketIndex]?.values[0] ?? 0,
            color: INVOCATION_STATUS_TO_CHART_PALETTE_MAP[status],
          };
        }),
      },
    ],
  }));
};
