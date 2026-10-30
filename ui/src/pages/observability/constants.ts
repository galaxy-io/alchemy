import { StartKind } from "@/gen/functions/v1/invocations_pb";
import { MetricGranularity } from "@/gen/metrics/v1/metrics_pb";

import {
  INVOCATIONS_DAY_MS,
  INVOCATIONS_HOUR_MS,
  INVOCATIONS_MINUTE_MS,
} from "@/components/invocations/constants";

import { ObservabilityTrafficFill } from "@/pages/observability/types";

export const OBSERVABILITY_DEFAULT_TRAFFIC_FILL = ObservabilityTrafficFill.VOLUME;

export const OBSERVABILITY_CHART_HEIGHT = 240;
export const OBSERVABILITY_CHART_MIN_WIDTH = 420;
export const OBSERVABILITY_SCROLL_END_TOLERANCE_PX = 1;
export const OBSERVABILITY_WHEEL_LINE_PX = 16;

export const OBSERVABILITY_START_KINDS = [
  StartKind.COLD_BOOT,
  StartKind.SNAPSHOT_RESTORE,
  StartKind.WARM,
];

export const OBSERVABILITY_GRANULARITY_TO_DURATION_MS_MAP: Record<MetricGranularity, number> = {
  [MetricGranularity.UNSPECIFIED]: INVOCATIONS_HOUR_MS,
  [MetricGranularity.MINUTE]: INVOCATIONS_MINUTE_MS,
  [MetricGranularity.HOUR]: INVOCATIONS_HOUR_MS,
  [MetricGranularity.DAY]: INVOCATIONS_DAY_MS,
};
