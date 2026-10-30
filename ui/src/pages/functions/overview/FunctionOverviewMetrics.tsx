import type { FC } from "react";

import BigNumber from "@galaxy-io/dls/charts/BigNumber";
import BigNumberGroup, { BigNumberGroupVariant } from "@galaxy-io/dls/charts/BigNumberGroup";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import {
  INVOCATION_SETTLED_STATUSES,
  INVOCATION_STATUS_TO_LABEL_MAP,
} from "@/components/invocations/constants";
import { useInvocationMetrics } from "@/components/invocations/hooks/useInvocationMetrics";
import { useInvocationsTimeframeSince } from "@/components/invocations/hooks/useInvocationsTimeframeSince";
import InvocationStatusSwatch from "@/components/invocations/InvocationStatusSwatch";
import { InvocationsTimeframe } from "@/components/invocations/types";

import { formatCount, formatMillis, formatRatio } from "@/utils/format";

interface FunctionOverviewMetricsProps {
  functionId: AlchemyFunction["id"];
}

const FunctionOverviewMetrics: FC<FunctionOverviewMetricsProps> = ({ functionId }) => {
  const sinceMs = useInvocationsTimeframeSince(InvocationsTimeframe.TWENTY_FOUR_HOURS);
  const metrics = useInvocationMetrics({ sinceMs, functionId });
  const succeeded = metrics.countByStatus.get(InvocationStatus.SUCCEEDED) ?? 0;

  return (
    <BigNumberGroup
      ariaLabel="Function metrics"
      variant={BigNumberGroupVariant.PRIMARY}
      hasBorder
      fillWidth
      primary={
        <BigNumber
          label="Last 24 hours"
          value={formatCount(metrics.count)}
          isLoading={metrics.isTotalsLoading}
        />
      }
    >
      {INVOCATION_SETTLED_STATUSES.map((status) => (
        <BigNumber
          key={status}
          label={INVOCATION_STATUS_TO_LABEL_MAP[status]}
          value={formatCount(metrics.countByStatus.get(status) ?? 0)}
          suffix={<InvocationStatusSwatch status={status} />}
          isLoading={metrics.isStatusLoading}
        />
      ))}
      <BigNumber
        label="Success"
        value={formatRatio(metrics.count ? succeeded / metrics.count : undefined)}
        isLoading={metrics.isStatusLoading}
      />
      <BigNumber
        label="Avg duration"
        value={formatMillis(metrics.meanTotalMs)}
        isLoading={metrics.isTotalsLoading}
      />
      <BigNumber
        label="Warm"
        value={formatRatio(metrics.warmRatio, 0)}
        isLoading={metrics.isStartKindLoading}
      />
    </BigNumberGroup>
  );
};

export default FunctionOverviewMetrics;
