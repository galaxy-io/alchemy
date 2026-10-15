import { create } from "@bufbuild/protobuf";

import type { LineChartLineDatum } from "@galaxy-io/dls/charts/LineChart";

import {
  Metric,
  MetricDimension,
  MetricFilterSchema,
  type Timeseries,
} from "@/gen/metrics/v1/metrics_pb";

import { START_KIND_TO_WIRE_TOKEN_MAP } from "@/components/invocations/constants";
import type { InvocationsTimeframe } from "@/components/invocations/types";
import { mapWireTokenToStartKind } from "@/components/invocations/utils";

import { OBSERVABILITY_START_KINDS } from "@/pages/observability/constants";
import { createObservabilityTimeseriesInput } from "@/pages/observability/utils";

export const createObservabilityLatencyInput = (
  timeframe: InvocationsTimeframe,
  bucketStartMs: number,
) =>
  createObservabilityTimeseriesInput(timeframe, bucketStartMs, {
    metrics: [Metric.INVOCATION_COUNT, Metric.INVOCATION_TOTAL_DURATION],
    groupBy: MetricDimension.START_KIND,
    filters: [
      create(MetricFilterSchema, {
        dimension: MetricDimension.START_KIND,
        values: OBSERVABILITY_START_KINDS.map((kind) => START_KIND_TO_WIRE_TOKEN_MAP[kind]),
      }),
    ],
  });

export const mapTimeseriesToLatencyLines = (series: Timeseries[]): LineChartLineDatum<string>[] =>
  series.map((startKindSeries) => ({
    metric: String(mapWireTokenToStartKind(startKindSeries.key)),
    points: startKindSeries.points.map((point) => ({
      x: point.bucketStartMs.toString(),
      y: point.values[0] ? (point.values[1] ?? null) : null,
    })),
  }));
