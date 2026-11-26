import { ChartPalette, type ChartSeriesStyles } from "@galaxy-io/dls/charts/types";
import type { SelectOption } from "@galaxy-io/dls/inputs/SelectInput";

import { MetricDimension } from "@/gen/metrics/v1/metrics_pb";

import type { ObservabilityInvocationsMetric } from "@/pages/observability/components/invocations/types";

export const OBSERVABILITY_INVOCATIONS_SERIES: ChartSeriesStyles<ObservabilityInvocationsMetric> = {
  invocations: { label: "Invocations" },
};

export const OBSERVABILITY_INVOCATIONS_LABEL = "Invocations";
export const OBSERVABILITY_INVOCATIONS_COLOR = ChartPalette.PURPLE;
export const OBSERVABILITY_INVOCATIONS_GROUP_SELECT_WIDTH = 110;
export const OBSERVABILITY_INVOCATIONS_FUNCTIONS_PAGE_SIZE = 200;

export const OBSERVABILITY_INVOCATIONS_GROUP_OPTIONS: SelectOption[] = [
  { id: String(MetricDimension.FUNCTION_ID), label: "Function" },
  { id: String(MetricDimension.STATUS), label: "Status" },
];

export const OBSERVABILITY_INVOCATIONS_FUNCTION_COLORS: ChartPalette[] = [
  ChartPalette.PURPLE,
  ChartPalette.PINK,
  ChartPalette.BLUE,
  ChartPalette.TEAL,
  ChartPalette.LIME,
  ChartPalette.ORANGE,
  ChartPalette.YELLOW,
  ChartPalette.GREEN,
];
