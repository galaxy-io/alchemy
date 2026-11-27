import type { ChartPalette } from "@galaxy-io/dls/charts/types";

import type { TimeseriesPoint } from "@/gen/metrics/v1/metrics_pb";

export type ObservabilityInvocationsMetric = "invocations";

export interface ObservabilityInvocationsSeriesEntry {
  key: string;
  label: string;
  color: ChartPalette;
  points: TimeseriesPoint[];
}
