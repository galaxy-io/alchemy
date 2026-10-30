import type { ListInvocationsRequest } from "@/gen/functions/v1/invocations_pb";

import { INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP } from "@/components/invocations/constants";
import type { InvocationsTimeframe } from "@/components/invocations/types";

import { OBSERVABILITY_GRANULARITY_TO_DURATION_MS_MAP } from "@/pages/observability/constants";
import { createTimeframeSince } from "@/pages/observability/utils";

export const createHistoryWindowInput = (
  timeframe: InvocationsTimeframe,
  bucketStartMs: number,
  invocationsBucket: bigint | undefined,
): Pick<ListInvocationsRequest, "sinceMs" | "untilMs"> => {
  const sinceMs = createTimeframeSince(timeframe, bucketStartMs);
  if (invocationsBucket === undefined) {
    return { sinceMs, untilMs: 0n };
  }
  const { granularity } = INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe];
  return {
    sinceMs: invocationsBucket > sinceMs ? invocationsBucket : sinceMs,
    untilMs: invocationsBucket + BigInt(OBSERVABILITY_GRANULARITY_TO_DURATION_MS_MAP[granularity]),
  };
};
