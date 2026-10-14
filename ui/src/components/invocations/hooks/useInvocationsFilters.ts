import type { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import { INVOCATIONS_DEFAULT_TIMEFRAME } from "@/components/invocations/constants";
import { useInvocationsTimeframeSince } from "@/components/invocations/hooks/useInvocationsTimeframeSince";
import type { InvocationsTimeframe } from "@/components/invocations/types";

import { useAlchemySearchUpdate, useInvocationsSearch } from "@/module/hooks";
import type { InvocationsSearch } from "@/module/schemas";

export const useInvocationsFilters = () => {
  const updateSearch = useAlchemySearchUpdate<InvocationsSearch>();
  const { timeframe, statuses } = useInvocationsSearch();
  const sinceMs = useInvocationsTimeframeSince(timeframe);

  const handleTimeframeChange = (next: InvocationsTimeframe) => {
    void updateSearch(
      (prev) => ({
        ...prev,
        timeframe: next === INVOCATIONS_DEFAULT_TIMEFRAME ? undefined : next,
      }),
      { replace: true },
    );
  };

  const handleStatusesChange = (next: InvocationStatus[]) => {
    void updateSearch((prev) => ({ ...prev, statuses: next.length ? next : undefined }), {
      replace: true,
    });
  };

  return { timeframe, statuses, sinceMs, handleTimeframeChange, handleStatusesChange };
};
