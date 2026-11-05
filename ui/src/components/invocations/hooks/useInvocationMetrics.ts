import { useMemo } from "react";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import { StartKind } from "@/gen/functions/v1/invocations_pb";

import {
  mapWireTokenToInvocationStatus,
  mapWireTokenToStartKind,
} from "@/components/invocations/utils";

import { createInvocationMetricsInputs, useQueryAggregateQuery } from "@/api/queries/metrics";

export const useInvocationMetrics = ({
  sinceMs,
  functionId,
  refetchInterval,
}: {
  sinceMs: bigint;
  functionId?: AlchemyFunction["id"];
  refetchInterval?: number;
}) => {
  const options = refetchInterval === undefined ? undefined : { refetchInterval };
  const { totalsInput, statusInput, startKindInput } = useMemo(
    () => createInvocationMetricsInputs({ sinceMs, functionId }),
    [sinceMs, functionId],
  );

  const { data: totalsData, isLoading: isTotalsLoading } = useQueryAggregateQuery({
    input: totalsInput,
    options,
  });
  const { data: statusData, isLoading: isStatusLoading } = useQueryAggregateQuery({
    input: statusInput,
    options,
  });
  const { data: startKindData, isLoading: isStartKindLoading } = useQueryAggregateQuery({
    input: startKindInput,
    options,
  });

  const [count = 0, meanTotalMs, meanAcquireMs] = totalsData?.rows[0]?.values ?? [];

  const countByStatus = new Map(
    (statusData?.rows ?? []).map((row) => [
      mapWireTokenToInvocationStatus(row.key),
      row.values[0] ?? 0,
    ]),
  );

  const startedRows = (startKindData?.rows ?? []).filter(
    (row) => mapWireTokenToStartKind(row.key) !== StartKind.UNSPECIFIED,
  );
  const started = startedRows.reduce((sum, row) => sum + (row.values[0] ?? 0), 0);
  const warm = startedRows
    .filter((row) => mapWireTokenToStartKind(row.key) === StartKind.WARM)
    .reduce((sum, row) => sum + (row.values[0] ?? 0), 0);

  return {
    count,
    meanTotalMs: count ? meanTotalMs : undefined,
    meanAcquireMs: count ? meanAcquireMs : undefined,
    countByStatus,
    warmRatio: started ? warm / started : undefined,
    isTotalsLoading,
    isStatusLoading,
    isStartKindLoading,
  };
};
