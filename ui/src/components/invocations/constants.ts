import { ChartPalette } from "@galaxy-io/dls/charts/types";
import type { PaletteColor, RoleColor } from "@galaxy-io/dls/theme/tokens/types";

import { FunctionErrorKind, InvocationStatus, StartKind } from "@/gen/functions/v1/invocations_pb";
import { MetricGranularity } from "@/gen/metrics/v1/metrics_pb";

import {
  InvocationPhase,
  InvocationsTimeframe,
  type InvocationsTimeframeConfig,
} from "@/components/invocations/types";

import { getEnumValues } from "@/utils/select";

export const INVOCATIONS_MINUTE_MS = 60 * 1000;
export const INVOCATIONS_HOUR_MS = 60 * INVOCATIONS_MINUTE_MS;
export const INVOCATIONS_DAY_MS = 24 * INVOCATIONS_HOUR_MS;

export const INVOCATIONS_DEFAULT_TIMEFRAME = InvocationsTimeframe.TWENTY_FOUR_HOURS;

export const INVOCATIONS_TIMEFRAMES = Object.values(InvocationsTimeframe);

export const INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP: Record<
  InvocationsTimeframe,
  InvocationsTimeframeConfig
> = {
  [InvocationsTimeframe.ONE_HOUR]: {
    label: "1 hour",
    durationMs: INVOCATIONS_HOUR_MS,
    granularity: MetricGranularity.MINUTE,
  },
  [InvocationsTimeframe.TWENTY_FOUR_HOURS]: {
    label: "24 hours",
    durationMs: INVOCATIONS_DAY_MS,
    granularity: MetricGranularity.HOUR,
  },
  [InvocationsTimeframe.SEVEN_DAYS]: {
    label: "7 days",
    durationMs: 7 * INVOCATIONS_DAY_MS,
    granularity: MetricGranularity.DAY,
  },
};

export const INVOCATION_STATUSES = getEnumValues(InvocationStatus);

export const START_KINDS = getEnumValues(StartKind);

export const INVOCATION_STATUS_TO_LABEL_MAP: Record<InvocationStatus, string> = {
  [InvocationStatus.UNSPECIFIED]: "Unknown",
  [InvocationStatus.PENDING]: "Pending",
  [InvocationStatus.STARTING]: "Starting",
  [InvocationStatus.RUNNING]: "Running",
  [InvocationStatus.SUCCEEDED]: "Succeeded",
  [InvocationStatus.FAILED]: "Failed",
  [InvocationStatus.ERRORED]: "Errored",
  [InvocationStatus.CANCELED]: "Canceled",
};

export const INVOCATION_STATUS_TO_HUE_MAP: Record<InvocationStatus, RoleColor | undefined> = {
  [InvocationStatus.UNSPECIFIED]: undefined,
  [InvocationStatus.PENDING]: undefined,
  [InvocationStatus.STARTING]: "yellow",
  [InvocationStatus.RUNNING]: "blue",
  [InvocationStatus.SUCCEEDED]: "success",
  [InvocationStatus.FAILED]: "error",
  [InvocationStatus.ERRORED]: "warning",
  [InvocationStatus.CANCELED]: undefined,
};

export const INVOCATION_STATUS_TO_CHART_PALETTE_MAP: Record<InvocationStatus, ChartPalette> = {
  [InvocationStatus.UNSPECIFIED]: ChartPalette.TERTIARY,
  [InvocationStatus.PENDING]: ChartPalette.TERTIARY,
  [InvocationStatus.STARTING]: ChartPalette.YELLOW,
  [InvocationStatus.RUNNING]: ChartPalette.BLUE,
  [InvocationStatus.SUCCEEDED]: ChartPalette.SUCCESS,
  [InvocationStatus.FAILED]: ChartPalette.ERROR,
  [InvocationStatus.ERRORED]: ChartPalette.WARNING,
  [InvocationStatus.CANCELED]: ChartPalette.SECONDARY,
};

export const INVOCATION_STATUS_TO_WIRE_TOKEN_MAP: Record<InvocationStatus, string> = {
  [InvocationStatus.UNSPECIFIED]: "",
  [InvocationStatus.PENDING]: "pending",
  [InvocationStatus.STARTING]: "starting",
  [InvocationStatus.RUNNING]: "running",
  [InvocationStatus.SUCCEEDED]: "succeeded",
  [InvocationStatus.FAILED]: "failed",
  [InvocationStatus.ERRORED]: "errored",
  [InvocationStatus.CANCELED]: "canceled",
};

export const LIVE_INVOCATION_STATUSES = new Set<InvocationStatus>([
  InvocationStatus.STARTING,
  InvocationStatus.RUNNING,
]);

export const START_KIND_TO_LABEL_MAP: Record<StartKind, string> = {
  [StartKind.UNSPECIFIED]: "Unknown",
  [StartKind.COLD_BOOT]: "Cold boot",
  [StartKind.SNAPSHOT_RESTORE]: "Snapshot",
  [StartKind.WARM]: "Warm",
};

export const START_KIND_TO_DESCRIPTION_MAP: Record<StartKind, string> = {
  [StartKind.UNSPECIFIED]: "",
  [StartKind.COLD_BOOT]: "Booted a kernel for this invocation",
  [StartKind.SNAPSHOT_RESTORE]: "Restored the version's snapshot",
  [StartKind.WARM]: "Reused a microVM that was already running",
};

export const START_KIND_TO_HUE_MAP: Record<StartKind, RoleColor | undefined> = {
  [StartKind.UNSPECIFIED]: undefined,
  [StartKind.COLD_BOOT]: "orange",
  [StartKind.SNAPSHOT_RESTORE]: "violet",
  [StartKind.WARM]: "teal",
};

export const START_KIND_TO_CHART_PALETTE_MAP: Record<StartKind, ChartPalette> = {
  [StartKind.UNSPECIFIED]: ChartPalette.TERTIARY,
  [StartKind.COLD_BOOT]: ChartPalette.ORANGE,
  [StartKind.SNAPSHOT_RESTORE]: ChartPalette.PURPLE,
  [StartKind.WARM]: ChartPalette.TEAL,
};

export const START_KIND_TO_WIRE_TOKEN_MAP: Record<StartKind, string> = {
  [StartKind.UNSPECIFIED]: "",
  [StartKind.COLD_BOOT]: "cold_boot",
  [StartKind.SNAPSHOT_RESTORE]: "snapshot_restore",
  [StartKind.WARM]: "warm",
};

export const FUNCTION_ERROR_KIND_TO_LABEL_MAP: Record<FunctionErrorKind, string> = {
  [FunctionErrorKind.UNSPECIFIED]: "Unknown",
  [FunctionErrorKind.RAISED]: "Raised",
  [FunctionErrorKind.CRASHED]: "Crashed",
  [FunctionErrorKind.TIMEOUT]: "Timed out",
  [FunctionErrorKind.OUTPUT_INVALID]: "Output invalid",
};

export const INVOCATIONS_TABLE_COLUMN_WIDTH_STATUS = 140;
export const INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_FUNCTION = 200;
export const INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_INVOCATION = 160;
export const INVOCATIONS_TABLE_COLUMN_WIDTH_START_KIND = 120;
export const INVOCATIONS_TABLE_COLUMN_WIDTH_DURATION = 110;
export const INVOCATIONS_TABLE_COLUMN_WIDTH_CREATED_AT = 120;

export const INVOCATIONS_STATUS_FILTER_WIDTH = 240;

export const INVOCATION_PHASE_BAR_HEIGHT = 6;
export const INVOCATION_PHASE_BAR_SEGMENT_MIN_WIDTH = 2;

export const INVOCATION_SETTLED_STATUSES = [
  InvocationStatus.SUCCEEDED,
  InvocationStatus.FAILED,
  InvocationStatus.ERRORED,
];

export const INVOCATION_PHASES = [
  InvocationPhase.ACQUIRE,
  InvocationPhase.RUN,
  InvocationPhase.VALIDATE,
];

export const INVOCATION_PHASE_TO_LABEL_MAP: Record<InvocationPhase, string> = {
  [InvocationPhase.ACQUIRE]: "Acquire",
  [InvocationPhase.RUN]: "Run",
  [InvocationPhase.VALIDATE]: "Validate",
};

export const INVOCATION_PHASE_TO_HUE_MAP: Record<InvocationPhase, PaletteColor | undefined> = {
  [InvocationPhase.ACQUIRE]: "fuchsia",
  [InvocationPhase.RUN]: "sky",
  [InvocationPhase.VALIDATE]: undefined,
};

export const INVOCATION_STATUS_REASON_ICON_SIZE = 14;
