import { create } from "@bufbuild/protobuf";
import { match } from "ts-pattern";

import type { HeatmapCellDatum } from "@galaxy-io/dls/charts/Heatmap";

import { StartKind } from "@/gen/functions/v1/invocations_pb";
import {
  Metric,
  MetricDimension,
  QueryTimeseriesRequestSchema,
  type Timeseries,
} from "@/gen/metrics/v1/metrics_pb";

import { mapWireTokenToStartKind } from "@/components/invocations/utils";

import {
  OBSERVABILITY_TRAFFIC_DAYS,
  OBSERVABILITY_TRAFFIC_DURATION_MS,
  OBSERVABILITY_TRAFFIC_GRANULARITY,
  OBSERVABILITY_TRAFFIC_HOURS,
} from "@/pages/observability/components/traffic/constants";
import { ObservabilityTrafficFill } from "@/pages/observability/types";
import { createWindowSince } from "@/pages/observability/utils";

import { formatCount, formatRatio } from "@/utils/format";

const OBSERVABILITY_TRAFFIC_HOUR_LABEL_PATTERN = /^\d+$/;

interface ObservabilityTrafficCount {
  total: number;
  cold: number;
}

const getWeekdayIndex = (unixMillis: number) => (new Date(unixMillis).getDay() + 6) % 7;

export const createObservabilityTrafficInput = (bucketStartMs: number) =>
  create(QueryTimeseriesRequestSchema, {
    metrics: [Metric.INVOCATION_COUNT],
    groupBy: MetricDimension.START_KIND,
    granularity: OBSERVABILITY_TRAFFIC_GRANULARITY,
    sinceMs: createWindowSince(
      OBSERVABILITY_TRAFFIC_GRANULARITY,
      OBSERVABILITY_TRAFFIC_DURATION_MS,
      bucketStartMs,
    ),
    tzOffsetMinutes: -new Date(bucketStartMs).getTimezoneOffset(),
  });

export const createObservabilityTrafficCells = (
  series: Timeseries[],
  fill: ObservabilityTrafficFill,
): HeatmapCellDatum[] => {
  const counts = new Map<string, ObservabilityTrafficCount>();
  for (const startKindSeries of series) {
    const isCold = mapWireTokenToStartKind(startKindSeries.key) === StartKind.COLD_BOOT;
    for (const point of startKindSeries.points) {
      const value = point.values[0] ?? 0;
      if (!value) continue;
      const startMs = Number(point.bucketStartMs);
      const key = `${getWeekdayIndex(startMs)}:${new Date(startMs).getHours()}`;
      const count = counts.get(key) ?? { total: 0, cold: 0 };
      counts.set(key, {
        total: count.total + value,
        cold: count.cold + (isCold ? value : 0),
      });
    }
  }
  return OBSERVABILITY_TRAFFIC_DAYS.flatMap((day, dayIndex) =>
    OBSERVABILITY_TRAFFIC_HOURS.map((hour) => {
      const count = counts.get(`${dayIndex}:${hour}`);
      const value = !count
        ? null
        : match(fill)
            .with(ObservabilityTrafficFill.VOLUME, () => count.total)
            .with(ObservabilityTrafficFill.COLD, () => count.cold / count.total)
            .exhaustive();
      return { row: day, column: hour, value };
    }),
  );
};

export const formatObservabilityTrafficLabel = (label: string) =>
  OBSERVABILITY_TRAFFIC_HOUR_LABEL_PATTERN.test(label) ? `${label.padStart(2, "0")}h` : label;

export const formatObservabilityTrafficValue = (value: number, fill: ObservabilityTrafficFill) =>
  match(fill)
    .with(ObservabilityTrafficFill.VOLUME, () => formatCount(Math.round(value)))
    .with(ObservabilityTrafficFill.COLD, () => formatRatio(value, 0))
    .exhaustive();
