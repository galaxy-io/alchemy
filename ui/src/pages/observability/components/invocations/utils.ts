import { create } from "@bufbuild/protobuf";
import { match } from "ts-pattern";

import type { BarChartGroupDatum } from "@galaxy-io/dls/charts/BarChart";
import type { ChartSelection } from "@galaxy-io/dls/charts/types";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";
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

import {
  OBSERVABILITY_INVOCATIONS_COLOR,
  OBSERVABILITY_INVOCATIONS_FUNCTION_COLORS,
  OBSERVABILITY_INVOCATIONS_LABEL,
} from "@/pages/observability/components/invocations/constants";
import type {
  ObservabilityInvocationsMetric,
  ObservabilityInvocationsSeriesEntry,
} from "@/pages/observability/components/invocations/types";
import { createObservabilityTimeseriesInput } from "@/pages/observability/utils";

export const createObservabilityInvocationsInput = (
  timeframe: InvocationsTimeframe,
  bucketStartMs: number,
  group: MetricDimension,
) =>
  createObservabilityTimeseriesInput(timeframe, bucketStartMs, {
    metrics: [Metric.INVOCATION_COUNT],
    groupBy: group,
    filters: [
      create(MetricFilterSchema, {
        dimension: MetricDimension.STATUS,
        values: INVOCATION_SETTLED_STATUSES.map(
          (status) => INVOCATION_STATUS_TO_WIRE_TOKEN_MAP[status],
        ),
      }),
    ],
  });

const sumTimeseries = ({ points }: Timeseries) =>
  points.reduce((total, point) => total + (point.values[0] ?? 0), 0);

const getObservabilityInvocationsStatusEntries = (
  series: Timeseries[],
): ObservabilityInvocationsSeriesEntry[] =>
  series.map(({ key, points }) => {
    const status = mapWireTokenToInvocationStatus(key);
    return {
      key,
      label: INVOCATION_STATUS_TO_LABEL_MAP[status],
      color: INVOCATION_STATUS_TO_CHART_PALETTE_MAP[status],
      points,
    };
  });

const getObservabilityInvocationsFunctionEntries = (
  series: Timeseries[],
  functionsById: Map<AlchemyFunction["id"], AlchemyFunction>,
): ObservabilityInvocationsSeriesEntry[] =>
  series
    .map((functionSeries) => ({ functionSeries, total: sumTimeseries(functionSeries) }))
    .filter(({ total }) => total > 0)
    .sort((a, b) => b.total - a.total)
    .map(({ functionSeries: { key, points } }, index) => ({
      key,
      label: functionsById.get(key)?.name ?? key,
      color:
        OBSERVABILITY_INVOCATIONS_FUNCTION_COLORS[
          index % OBSERVABILITY_INVOCATIONS_FUNCTION_COLORS.length
        ],
      points,
    }));

const getObservabilityInvocationsEntries = (
  group: MetricDimension,
  series: Timeseries[],
  functionsById: Map<AlchemyFunction["id"], AlchemyFunction>,
): ObservabilityInvocationsSeriesEntry[] =>
  match(group)
    .with(MetricDimension.STATUS, () => getObservabilityInvocationsStatusEntries(series))
    .with(MetricDimension.FUNCTION_ID, () =>
      getObservabilityInvocationsFunctionEntries(series, functionsById),
    )
    .otherwise(() => [
      {
        key: OBSERVABILITY_INVOCATIONS_LABEL,
        label: OBSERVABILITY_INVOCATIONS_LABEL,
        color: OBSERVABILITY_INVOCATIONS_COLOR,
        points: series[0]?.points ?? [],
      },
    ]);

export const mapTimeseriesToInvocationsGroups = (
  group: MetricDimension,
  series: Timeseries[],
  functionsById: Map<AlchemyFunction["id"], AlchemyFunction>,
): BarChartGroupDatum<ObservabilityInvocationsMetric>[] => {
  const hasInvocations = series.some((keySeries) => sumTimeseries(keySeries) > 0);
  if (!hasInvocations) return [];
  const entries = getObservabilityInvocationsEntries(group, series, functionsById);
  return (series[0]?.points ?? []).map((point, bucketIndex) => ({
    label: point.bucketStartMs.toString(),
    bars: [
      {
        metric: "invocations",
        components: entries.map(({ key, label, color, points }) => ({
          key,
          label,
          value: points[bucketIndex]?.values[0] ?? 0,
          color,
        })),
      },
    ],
  }));
};

export const getObservabilityInvocationsSeriesKey = (
  group: MetricDimension,
  invocationsStatus: InvocationStatus | undefined,
  invocationsFunction: AlchemyFunction["id"] | undefined,
) =>
  match(group)
    .with(MetricDimension.STATUS, () =>
      invocationsStatus === undefined
        ? undefined
        : INVOCATION_STATUS_TO_WIRE_TOKEN_MAP[invocationsStatus],
    )
    .with(MetricDimension.FUNCTION_ID, () => invocationsFunction)
    .otherwise(() => undefined);

const mapSeriesKeyToInvocationsStatus = (seriesKey: string) => {
  const status = mapWireTokenToInvocationStatus(seriesKey);
  return status === InvocationStatus.UNSPECIFIED ? undefined : status;
};

export const mapChartSelectionToInvocationsFilter = (
  group: MetricDimension,
  selection: ChartSelection | undefined,
) => {
  const seriesKey = selection?.seriesKey;
  return {
    invocationsBucket:
      selection?.categoryKey === undefined ? undefined : BigInt(selection.categoryKey),
    invocationsStatus:
      group === MetricDimension.STATUS && seriesKey !== undefined
        ? mapSeriesKeyToInvocationsStatus(seriesKey)
        : undefined,
    invocationsFunction: group === MetricDimension.FUNCTION_ID && seriesKey ? seriesKey : undefined,
  };
};

export const getObservabilityInvocationsAriaLabel = (group: MetricDimension) =>
  match(group)
    .with(MetricDimension.STATUS, () => "Invocations by status")
    .with(MetricDimension.FUNCTION_ID, () => "Invocations by function")
    .otherwise(() => OBSERVABILITY_INVOCATIONS_LABEL);
