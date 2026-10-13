import type { ChartSeriesStyles } from "@galaxy-io/dls/charts/types";

import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import {
  START_KIND_TO_CHART_PALETTE_MAP,
  START_KIND_TO_LABEL_MAP,
  START_KINDS,
} from "@/pages/invocations/constants";
import { ObservabilityTrafficFill } from "@/pages/observability/types";

export const OBSERVABILITY_DEFAULT_TRAFFIC_FILL = ObservabilityTrafficFill.VOLUME;

export const OBSERVABILITY_CHART_HEIGHT = 240;
export const OBSERVABILITY_CHART_MIN_WIDTH = 420;

export const OBSERVABILITY_INVOCATION_STATUSES = [
  InvocationStatus.SUCCEEDED,
  InvocationStatus.FAILED,
  InvocationStatus.ERRORED,
];

export const OBSERVABILITY_LATENCY_SERIES: ChartSeriesStyles<string> = Object.fromEntries(
  START_KINDS.map((startKind) => [
    String(startKind),
    {
      label: START_KIND_TO_LABEL_MAP[startKind],
      color: START_KIND_TO_CHART_PALETTE_MAP[startKind],
    },
  ]),
);
