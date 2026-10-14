import type { BarChartGroupDatum } from "@galaxy-io/dls/charts/BarChart";
import type { LineChartLineDatum } from "@galaxy-io/dls/charts/LineChart";

import {
  INVOCATION_STATUS_TO_CHART_PALETTE_MAP,
  INVOCATION_STATUS_TO_LABEL_MAP,
  START_KINDS,
} from "@/pages/invocations/constants";
import {
  countInvocationsByStatus,
  getInvocationDurations,
  getPercentile,
  type InvocationsBucket,
} from "@/pages/invocations/utils";
import { OBSERVABILITY_INVOCATION_STATUSES } from "@/pages/observability/constants";

const MICROS_PER_MILLI = 1000;

export const createObservabilityInvocationsGroups = (
  buckets: InvocationsBucket[],
): BarChartGroupDatum<"invocations">[] =>
  buckets.map((bucket) => {
    const counts = countInvocationsByStatus(bucket.invocations);
    return {
      label: bucket.label,
      bars: [
        {
          metric: "invocations",
          components: OBSERVABILITY_INVOCATION_STATUSES.map((status) => ({
            key: String(status),
            label: INVOCATION_STATUS_TO_LABEL_MAP[status],
            value: counts[status],
            color: INVOCATION_STATUS_TO_CHART_PALETTE_MAP[status],
          })),
        },
      ],
    };
  });

export const createObservabilityLatencyLines = (
  buckets: InvocationsBucket[],
): LineChartLineDatum<string>[] =>
  START_KINDS.map((startKind) => ({
    metric: String(startKind),
    points: buckets.map((bucket) => {
      const value = getPercentile(
        getInvocationDurations(
          bucket.invocations.filter((invocation) => invocation.startKind === startKind),
          "totalUs",
        ),
        50,
      );
      return { x: bucket.label, y: value === null ? null : value / MICROS_PER_MILLI };
    }),
  }));
