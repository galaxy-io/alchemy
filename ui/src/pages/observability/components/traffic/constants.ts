import { ChartPalette } from "@galaxy-io/dls/charts/types";
import type { ToggleOption } from "@galaxy-io/dls/inputs/ToggleInput";

import { MetricGranularity } from "@/gen/metrics/v1/metrics_pb";

import { INVOCATIONS_DAY_MS } from "@/components/invocations/constants";

import { ObservabilityTrafficFill } from "@/pages/observability/types";

const OBSERVABILITY_TRAFFIC_HOURS_PER_DAY = 24;

export const OBSERVABILITY_TRAFFIC_GRANULARITY = MetricGranularity.HOUR;
export const OBSERVABILITY_TRAFFIC_DURATION_MS = 7 * INVOCATIONS_DAY_MS;

export const OBSERVABILITY_TRAFFIC_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const OBSERVABILITY_TRAFFIC_HOURS = Array.from(
  { length: OBSERVABILITY_TRAFFIC_HOURS_PER_DAY },
  (_, hour) => String(hour),
);

export const OBSERVABILITY_TRAFFIC_FILL_TO_LABEL_MAP: Record<ObservabilityTrafficFill, string> = {
  [ObservabilityTrafficFill.VOLUME]: "Volume",
  [ObservabilityTrafficFill.COLD]: "Cold boots",
};

export const OBSERVABILITY_TRAFFIC_FILL_TO_COLOR_MAP: Record<
  ObservabilityTrafficFill,
  ChartPalette
> = {
  [ObservabilityTrafficFill.VOLUME]: ChartPalette.TEAL,
  [ObservabilityTrafficFill.COLD]: ChartPalette.ORANGE,
};

export const OBSERVABILITY_TRAFFIC_FILL_OPTIONS: ToggleOption<ObservabilityTrafficFill>[] =
  Object.values(ObservabilityTrafficFill).map((fill) => ({
    id: fill,
    label: OBSERVABILITY_TRAFFIC_FILL_TO_LABEL_MAP[fill],
  }));
