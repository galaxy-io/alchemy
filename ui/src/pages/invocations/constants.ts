import { ChartPalette } from "@galaxy-io/dls/charts/types";
import type { RoleColor } from "@galaxy-io/dls/theme/tokens/types";

import { FunctionErrorKind, InvocationStatus, StartKind } from "@/gen/functions/v1/invocations_pb";

import { InvocationsTimeframe } from "@/pages/invocations/types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const formatHourBucketLabel = (bucketStartMs: number) =>
  new Date(bucketStartMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const formatDayBucketLabel = (bucketStartMs: number) =>
  new Date(bucketStartMs).toLocaleDateString([], { weekday: "short" });

export interface InvocationsTimeframeConfig {
  label: string;
  durationMs: number;
  bucketMs: number;
  formatBucketLabel: (bucketStartMs: number) => string;
}

export const INVOCATIONS_DEFAULT_TIMEFRAME = InvocationsTimeframe.TWENTY_FOUR_HOURS;

export const INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP: Record<
  InvocationsTimeframe,
  InvocationsTimeframeConfig
> = {
  [InvocationsTimeframe.ONE_HOUR]: {
    label: "1 hour",
    durationMs: HOUR_MS,
    bucketMs: 5 * MINUTE_MS,
    formatBucketLabel: formatHourBucketLabel,
  },
  [InvocationsTimeframe.TWENTY_FOUR_HOURS]: {
    label: "24 hours",
    durationMs: DAY_MS,
    bucketMs: HOUR_MS,
    formatBucketLabel: formatHourBucketLabel,
  },
  [InvocationsTimeframe.SEVEN_DAYS]: {
    label: "7 days",
    durationMs: 7 * DAY_MS,
    bucketMs: DAY_MS,
    formatBucketLabel: formatDayBucketLabel,
  },
};

export const INVOCATION_STATUSES = Object.values(InvocationStatus).filter(
  (status): status is InvocationStatus =>
    typeof status === "number" && status !== InvocationStatus.UNSPECIFIED,
);

export const START_KINDS = Object.values(StartKind).filter(
  (kind): kind is StartKind => typeof kind === "number" && kind !== StartKind.UNSPECIFIED,
);

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

export const INVOCATION_STATUS_TO_HUE_MAP: Record<InvocationStatus, RoleColor | null> = {
  [InvocationStatus.UNSPECIFIED]: null,
  [InvocationStatus.PENDING]: null,
  [InvocationStatus.STARTING]: "yellow",
  [InvocationStatus.RUNNING]: "blue",
  [InvocationStatus.SUCCEEDED]: "success",
  [InvocationStatus.FAILED]: "error",
  [InvocationStatus.ERRORED]: "warning",
  [InvocationStatus.CANCELED]: null,
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

export const START_KIND_TO_LABEL_MAP: Record<StartKind, string> = {
  [StartKind.UNSPECIFIED]: "Unknown",
  [StartKind.COLD_BOOT]: "Cold boot",
  [StartKind.SNAPSHOT_RESTORE]: "Snapshot",
  [StartKind.WARM]: "Warm",
};

export const START_KIND_TO_DESCRIPTION_MAP: Record<StartKind, string> = {
  [StartKind.UNSPECIFIED]: "",
  [StartKind.COLD_BOOT]: "Booted a kernel for this invocation.",
  [StartKind.SNAPSHOT_RESTORE]: "Restored the version's snapshot.",
  [StartKind.WARM]: "Reused a microVM that was already running.",
};

export const START_KIND_TO_HUE_MAP: Record<StartKind, RoleColor | null> = {
  [StartKind.UNSPECIFIED]: null,
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

export const FUNCTION_ERROR_KIND_TO_LABEL_MAP: Record<FunctionErrorKind, string> = {
  [FunctionErrorKind.UNSPECIFIED]: "Unknown",
  [FunctionErrorKind.RAISED]: "Raised",
  [FunctionErrorKind.CRASHED]: "Crashed",
  [FunctionErrorKind.TIMEOUT]: "Timed out",
  [FunctionErrorKind.OUTPUT_INVALID]: "Output invalid",
};

export const INVOCATIONS_STATUS_FILTER_WIDTH = 240;
