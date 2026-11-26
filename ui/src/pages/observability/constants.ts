import { StartKind } from "@/gen/functions/v1/invocations_pb";
import { MetricGranularity } from "@/gen/metrics/v1/metrics_pb";

import {
  INVOCATIONS_DAY_MS,
  INVOCATIONS_HOUR_MS,
  INVOCATIONS_MINUTE_MS,
} from "@/components/invocations/constants";

import {
  ObservabilityInvocationsGroup,
  ObservabilityRefreshInterval,
  ObservabilityTrafficFill,
} from "@/pages/observability/types";

export const OBSERVABILITY_DEFAULT_TRAFFIC_FILL = ObservabilityTrafficFill.VOLUME;

export const OBSERVABILITY_DEFAULT_INVOCATIONS_GROUP = ObservabilityInvocationsGroup.STATUS;

export const OBSERVABILITY_DEFAULT_REFRESH_INTERVAL = ObservabilityRefreshInterval.ONE_MINUTE;

export const OBSERVABILITY_REFRESH_INTERVAL_TO_LABEL_MAP: Record<
  ObservabilityRefreshInterval,
  string
> = {
  [ObservabilityRefreshInterval.ONE_MINUTE]: "Every minute",
  [ObservabilityRefreshInterval.FIVE_MINUTES]: "Every 5 minutes",
  [ObservabilityRefreshInterval.FIFTEEN_MINUTES]: "Every 15 minutes",
  [ObservabilityRefreshInterval.THIRTY_MINUTES]: "Every 30 minutes",
  [ObservabilityRefreshInterval.ONE_HOUR]: "Every hour",
};

export const OBSERVABILITY_REFRESH_INTERVAL_TO_MS_MAP: Record<
  ObservabilityRefreshInterval,
  number
> = {
  [ObservabilityRefreshInterval.ONE_MINUTE]: INVOCATIONS_MINUTE_MS,
  [ObservabilityRefreshInterval.FIVE_MINUTES]: 5 * INVOCATIONS_MINUTE_MS,
  [ObservabilityRefreshInterval.FIFTEEN_MINUTES]: 15 * INVOCATIONS_MINUTE_MS,
  [ObservabilityRefreshInterval.THIRTY_MINUTES]: 30 * INVOCATIONS_MINUTE_MS,
  [ObservabilityRefreshInterval.ONE_HOUR]: INVOCATIONS_HOUR_MS,
};

export const OBSERVABILITY_REFRESH_INTERVAL_SELECT_WIDTH = 160;

export const OBSERVABILITY_WORDMARK_SIZE = 20;

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
