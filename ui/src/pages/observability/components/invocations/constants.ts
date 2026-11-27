import { ChartPalette, type ChartSeriesStyles } from "@galaxy-io/dls/charts/types";
import type { SelectOption } from "@galaxy-io/dls/inputs/SelectInput";

import { MetricDimension } from "@/gen/metrics/v1/metrics_pb";

import type { ObservabilityInvocationsMetric } from "@/pages/observability/components/invocations/types";
import { ObservabilityInvocationsGroup } from "@/pages/observability/types";

export const OBSERVABILITY_INVOCATIONS_LABEL = "Invocations";
export const OBSERVABILITY_INVOCATIONS_COLOR = ChartPalette.PURPLE;
export const OBSERVABILITY_INVOCATIONS_GROUP_SELECT_WIDTH = 110;

export const OBSERVABILITY_INVOCATIONS_SERIES: ChartSeriesStyles<ObservabilityInvocationsMetric> = {
  invocations: { label: OBSERVABILITY_INVOCATIONS_LABEL },
};

export const OBSERVABILITY_INVOCATIONS_GROUP_TO_ARIA_LABEL_MAP: Record<
  ObservabilityInvocationsGroup,
  string
> = {
  [ObservabilityInvocationsGroup.NONE]: OBSERVABILITY_INVOCATIONS_LABEL,
  [ObservabilityInvocationsGroup.STATUS]: "Invocations by status",
  [ObservabilityInvocationsGroup.FUNCTION]: "Invocations by function",
};

export const OBSERVABILITY_INVOCATIONS_GROUP_TO_DIMENSION_MAP: Record<
  ObservabilityInvocationsGroup,
  MetricDimension
> = {
  [ObservabilityInvocationsGroup.NONE]: MetricDimension.UNSPECIFIED,
  [ObservabilityInvocationsGroup.STATUS]: MetricDimension.STATUS,
  [ObservabilityInvocationsGroup.FUNCTION]: MetricDimension.FUNCTION_ID,
};

export const OBSERVABILITY_INVOCATIONS_GROUP_OPTIONS: SelectOption<ObservabilityInvocationsGroup>[] =
  [
    { id: ObservabilityInvocationsGroup.FUNCTION, label: "Function" },
    { id: ObservabilityInvocationsGroup.STATUS, label: "Status" },
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
