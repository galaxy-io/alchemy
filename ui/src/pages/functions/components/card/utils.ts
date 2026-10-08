import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import type { FunctionCardRow } from "@/pages/functions/components/card/types";
import { InvocationsTimeframe } from "@/pages/invocations/types";
import {
  filterInvocationsInTimeframe,
  getInvocationDurations,
  getPercentile,
  getSuccessRate,
} from "@/pages/invocations/utils";

export const createFunctionCardRows = (
  functions: AlchemyFunction[],
  invocations: Invocation[],
): FunctionCardRow[] =>
  functions
    .map((fn) => {
      const recentInvocations = invocations.filter((invocation) => invocation.functionId === fn.id);
      const windowInvocations = filterInvocationsInTimeframe(
        recentInvocations,
        InvocationsTimeframe.TWENTY_FOUR_HOURS,
      );
      return {
        fn,
        recentInvocations,
        count24h: windowInvocations.length,
        successRate: getSuccessRate(windowInvocations),
        p50Us: getPercentile(getInvocationDurations(windowInvocations, "totalUs"), 50),
      };
    })
    .sort((a, b) => b.count24h - a.count24h);
