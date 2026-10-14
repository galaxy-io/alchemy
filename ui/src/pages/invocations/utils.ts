import type { Invocation, InvocationStats } from "@/gen/functions/v1/invocations_pb";
import { InvocationStatus, StartKind } from "@/gen/functions/v1/invocations_pb";

import { INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP } from "@/pages/invocations/constants";
import type { InvocationsTimeframe } from "@/pages/invocations/types";

const MINUTE_MS = 60_000;

const TERMINAL_STATUSES = new Set<InvocationStatus>([
  InvocationStatus.SUCCEEDED,
  InvocationStatus.FAILED,
  InvocationStatus.ERRORED,
]);

export interface InvocationsBucket {
  startMs: number;
  label: string;
  invocations: Invocation[];
}

export const createTimeframeSince = (timeframe: InvocationsTimeframe): bigint => {
  const { durationMs } = INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe];
  const nowMs = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
  return BigInt(nowMs - durationMs);
};

export const filterInvocationsInTimeframe = (
  invocations: Invocation[],
  timeframe: InvocationsTimeframe,
  now = Date.now(),
) => {
  const since = now - INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe].durationMs;
  return invocations.filter((invocation) => Number(invocation.createdAt) >= since);
};

export const bucketizeInvocations = (
  invocations: Invocation[],
  timeframe: InvocationsTimeframe,
  now = Date.now(),
): InvocationsBucket[] => {
  const { bucketMs, durationMs, formatBucketLabel } =
    INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe];
  const end = Math.ceil(now / bucketMs) * bucketMs;
  const start = end - durationMs;
  const buckets: InvocationsBucket[] = Array.from(
    { length: Math.round(durationMs / bucketMs) },
    (_, index) => {
      const startMs = start + index * bucketMs;
      return { startMs, label: formatBucketLabel(startMs), invocations: [] };
    },
  );
  for (const invocation of invocations) {
    const createdAt = Number(invocation.createdAt);
    if (createdAt < start || createdAt >= end) continue;
    buckets[Math.floor((createdAt - start) / bucketMs)]?.invocations.push(invocation);
  }
  return buckets;
};

export const countInvocationsByStatus = (
  invocations: Invocation[],
): Record<InvocationStatus, number> => {
  const counts = Object.fromEntries(
    Object.values(InvocationStatus)
      .filter((status) => typeof status === "number")
      .map((status) => [status, 0]),
  ) as Record<InvocationStatus, number>;
  for (const invocation of invocations) counts[invocation.status] += 1;
  return counts;
};

export const getPercentile = (values: number[], percentile: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
};

export const getInvocationDurations = (
  invocations: Invocation[],
  phase: keyof Pick<InvocationStats, "acquireUs" | "runUs" | "totalUs">,
): number[] =>
  invocations.flatMap((invocation) =>
    invocation.stats && invocation.stats[phase] > 0n ? [Number(invocation.stats[phase])] : [],
  );

export const getSuccessRate = (invocations: Invocation[]): number | null => {
  const terminal = invocations.filter((invocation) => TERMINAL_STATUSES.has(invocation.status));
  if (terminal.length === 0) return null;
  return (
    terminal.filter((invocation) => invocation.status === InvocationStatus.SUCCEEDED).length /
    terminal.length
  );
};

export const getWarmRate = (invocations: Invocation[]): number | null => {
  const started = invocations.filter(
    (invocation) => invocation.startKind !== StartKind.UNSPECIFIED,
  );
  if (started.length === 0) return null;
  return (
    started.filter((invocation) => invocation.startKind === StartKind.WARM).length / started.length
  );
};

export const isInvocationLive = (status: InvocationStatus) =>
  status === InvocationStatus.RUNNING || status === InvocationStatus.STARTING;

export const filterInvocations = (
  invocations: Invocation[],
  {
    timeframe,
    statuses,
    term = "",
  }: { timeframe: InvocationsTimeframe; statuses: InvocationStatus[]; term?: string },
) =>
  filterInvocationsInTimeframe(invocations, timeframe).filter(
    (invocation) =>
      (statuses.length === 0 || statuses.includes(invocation.status)) &&
      (term === "" || invocation.id.includes(term) || invocation.functionId.includes(term)),
  );
