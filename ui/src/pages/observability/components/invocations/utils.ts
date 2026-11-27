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
  OBSERVABILITY_INVOCATIONS_GROUP_TO_DIMENSION_MAP,
  OBSERVABILITY_INVOCATIONS_LABEL,
} from "@/pages/observability/components/invocations/constants";
import type {
  ObservabilityInvocationsMetric,
  ObservabilityInvocationsSeriesEntry,
} from "@/pages/observability/components/invocations/types";
import { ObservabilityInvocationsGroup } from "@/pages/observability/types";
import { createObservabilityTimeseriesInput } from "@/pages/observability/utils";

export const createObservabilityInvocationsInput = (
  timeframe: InvocationsTimeframe,
  bucketStartMs: number,
  group: ObservabilityInvocationsGroup,
) =>
  createObservabilityTimeseriesInput(timeframe, bucketStartMs, {
    metrics: [Metric.INVOCATION_COUNT],
    groupBy: OBSERVABILITY_INVOCATIONS_GROUP_TO_DIMENSION_MAP[group],
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
  group: ObservabilityInvocationsGroup,
  series: Timeseries[],
  functionsById: Map<AlchemyFunction["id"], AlchemyFunction>,
): ObservabilityInvocationsSeriesEntry[] =>
  match(group)
    .with(ObservabilityInvocationsGroup.NONE, () => [
      {
        key: OBSERVABILITY_INVOCATIONS_LABEL,
        label: OBSERVABILITY_INVOCATIONS_LABEL,
        color: OBSERVABILITY_INVOCATIONS_COLOR,
        points: series[0]?.points ?? [],
      },
    ])
    .with(ObservabilityInvocationsGroup.STATUS, () =>
      getObservabilityInvocationsStatusEntries(series),
    )
    .with(ObservabilityInvocationsGroup.FUNCTION, () =>
      getObservabilityInvocationsFunctionEntries(series, functionsById),
    )
    .exhaustive();

export const mapTimeseriesToInvocationsGroups = (
  group: ObservabilityInvocationsGroup,
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

export const getObservabilityInvocationsFunctionIds = (
  group: ObservabilityInvocationsGroup,
  series: Timeseries[],
) =>
  match(group)
    .with(ObservabilityInvocationsGroup.FUNCTION, () =>
      series
        .filter((functionSeries) => functionSeries.key !== "" && sumTimeseries(functionSeries) > 0)
        .map(({ key }) => key),
    )
    .with(ObservabilityInvocationsGroup.NONE, ObservabilityInvocationsGroup.STATUS, () => [])
    .exhaustive();

export const getObservabilityInvocationsSeriesKey = (
  group: ObservabilityInvocationsGroup,
  invocationsStatus: InvocationStatus | undefined,
  invocationsFunction: AlchemyFunction["id"] | undefined,
) =>
  match(group)
    .with(ObservabilityInvocationsGroup.NONE, () => undefined)
    .with(ObservabilityInvocationsGroup.STATUS, () =>
      invocationsStatus === undefined
        ? undefined
        : INVOCATION_STATUS_TO_WIRE_TOKEN_MAP[invocationsStatus],
    )
    .with(ObservabilityInvocationsGroup.FUNCTION, () => invocationsFunction)
    .exhaustive();

const mapSeriesKeyToInvocationsStatus = (seriesKey: string | undefined) => {
  const status = mapWireTokenToInvocationStatus(seriesKey ?? "");
  return status === InvocationStatus.UNSPECIFIED ? undefined : status;
};

export const mapChartSelectionToInvocationsFilter = (
  group: ObservabilityInvocationsGroup,
  selection: ChartSelection | undefined,
) => ({
  invocationsBucket:
    selection?.categoryKey === undefined ? undefined : BigInt(selection.categoryKey),
  ...match(group)
    .with(ObservabilityInvocationsGroup.NONE, () => ({
      invocationsStatus: undefined,
      invocationsFunction: undefined,
    }))
    .with(ObservabilityInvocationsGroup.STATUS, () => ({
      invocationsStatus: mapSeriesKeyToInvocationsStatus(selection?.seriesKey),
      invocationsFunction: undefined,
    }))
    .with(ObservabilityInvocationsGroup.FUNCTION, () => ({
      invocationsStatus: undefined,
      invocationsFunction: selection?.seriesKey || undefined,
    }))
    .exhaustive(),
});
