import { useMemo } from "react";

import { create } from "@bufbuild/protobuf";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";
import {
  Metric,
  MetricDimension,
  MetricFilterSchema,
  QueryAggregateRequestSchema,
} from "@/gen/metrics/v1/metrics_pb";

import { INVOCATION_STATUS_TO_WIRE_TOKEN_MAP } from "@/components/invocations/constants";
import { useInvocationsTimeframeSince } from "@/components/invocations/hooks/useInvocationsTimeframeSince";
import { InvocationsTimeframe } from "@/components/invocations/types";

import type { FunctionCardMetrics } from "@/pages/functions/components/card/types";

import { useQueryAggregateQuery } from "@/api/queries/metrics";

export const useFunctionCardMetrics = () => {
  const sinceMs = useInvocationsTimeframeSince(InvocationsTimeframe.TWENTY_FOUR_HOURS);

  const { totalsInput, succeededInput } = useMemo(
    () => ({
      totalsInput: create(QueryAggregateRequestSchema, {
        metrics: [Metric.INVOCATION_COUNT, Metric.INVOCATION_TOTAL_DURATION],
        groupBy: MetricDimension.FUNCTION_ID,
        sinceMs,
      }),
      succeededInput: create(QueryAggregateRequestSchema, {
        metrics: [Metric.INVOCATION_COUNT],
        groupBy: MetricDimension.FUNCTION_ID,
        filters: [
          create(MetricFilterSchema, {
            dimension: MetricDimension.STATUS,
            values: [INVOCATION_STATUS_TO_WIRE_TOKEN_MAP[InvocationStatus.SUCCEEDED]],
          }),
        ],
        sinceMs,
      }),
    }),
    [sinceMs],
  );

  const { data: totalsData } = useQueryAggregateQuery({ input: totalsInput });
  const { data: succeededData } = useQueryAggregateQuery({ input: succeededInput });

  return useMemo(() => {
    const succeededById = new Map(
      (succeededData?.rows ?? []).map((row) => [row.key, row.values[0] ?? 0]),
    );
    return new Map<AlchemyFunction["id"], FunctionCardMetrics>(
      (totalsData?.rows ?? []).map((row) => {
        const [count = 0, meanDurationMs] = row.values;
        return [
          row.key,
          {
            count,
            successRatio: count ? (succeededById.get(row.key) ?? 0) / count : undefined,
            meanDurationMs: count ? meanDurationMs : undefined,
          },
        ];
      }),
    );
  }, [totalsData, succeededData]);
};
