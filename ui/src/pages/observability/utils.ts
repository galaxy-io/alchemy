import { create } from "@bufbuild/protobuf";
import { match } from "ts-pattern";

import {
  type Metric,
  type MetricDimension,
  type MetricFilter,
  MetricGranularity,
  type QueryTimeseriesRequest,
  QueryTimeseriesRequestSchema,
} from "@/gen/metrics/v1/metrics_pb";

import { INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP } from "@/components/invocations/constants";
import type { InvocationsTimeframe } from "@/components/invocations/types";

import { OBSERVABILITY_GRANULARITY_TO_DURATION_MS_MAP } from "@/pages/observability/constants";

const formatTimeBucketLabel = (bucketKey: string) =>
  new Date(Number(bucketKey)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const formatDayBucketLabel = (bucketKey: string) =>
  new Date(Number(bucketKey)).toLocaleDateString([], { weekday: "short" });

export const getBucketLabelFormatter = (granularity: MetricGranularity) =>
  match(granularity)
    .with(MetricGranularity.DAY, () => formatDayBucketLabel)
    .otherwise(() => formatTimeBucketLabel);

export const getBucketStart = (granularity: MetricGranularity, date: Date) =>
  match(granularity)
    .with(
      MetricGranularity.DAY,
      () => new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    )
    .with(
      MetricGranularity.MINUTE,
      () =>
        new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          date.getHours(),
          date.getMinutes(),
        ),
    )
    .otherwise(
      () => new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()),
    );

export const getNextBucketStart = (granularity: MetricGranularity, start: Date) =>
  match(granularity)
    .with(MetricGranularity.DAY, () =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime(),
    )
    .otherwise(() => start.getTime() + OBSERVABILITY_GRANULARITY_TO_DURATION_MS_MAP[granularity]);

export const createWindowSince = (
  granularity: MetricGranularity,
  durationMs: number,
  bucketStartMs: number,
) => BigInt(bucketStartMs + OBSERVABILITY_GRANULARITY_TO_DURATION_MS_MAP[granularity] - durationMs);

export const createTimeframeSince = (timeframe: InvocationsTimeframe, bucketStartMs: number) => {
  const { granularity, durationMs } = INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe];
  return createWindowSince(granularity, durationMs, bucketStartMs);
};

export const createObservabilityTimeseriesInput = (
  timeframe: InvocationsTimeframe,
  bucketStartMs: number,
  init: { metrics: Metric[]; groupBy?: MetricDimension; filters?: MetricFilter[] },
): QueryTimeseriesRequest =>
  create(QueryTimeseriesRequestSchema, {
    ...init,
    sinceMs: createTimeframeSince(timeframe, bucketStartMs),
    granularity: INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe].granularity,
    tzOffsetMinutes: -new Date(bucketStartMs).getTimezoneOffset(),
  });
