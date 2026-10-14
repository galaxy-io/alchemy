import type { FC } from "react";

import BigNumber from "@galaxy-io/dls/charts/BigNumber";
import BigNumberGroup, { BigNumberGroupVariant } from "@galaxy-io/dls/charts/BigNumberGroup";

import {
  INVOCATION_SETTLED_STATUSES,
  INVOCATION_STATUS_TO_LABEL_MAP,
  INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP,
} from "@/components/invocations/constants";
import { useInvocationMetrics } from "@/components/invocations/hooks/useInvocationMetrics";
import InvocationStatusSwatch from "@/components/invocations/InvocationStatusSwatch";

import { useObservabilityBucketStart } from "@/pages/observability/hooks/useObservabilityBucketStart";
import { createTimeframeSince } from "@/pages/observability/utils";

import { useObservabilitySearch } from "@/module/hooks";

import { formatCount, formatMillis, formatRatio } from "@/utils/format";

const ObservabilityMetricsWidget: FC = () => {
  const { timeframe } = useObservabilitySearch();
  const bucketStartMs = useObservabilityBucketStart(
    INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe].granularity,
  );
  const metrics = useInvocationMetrics({ sinceMs: createTimeframeSince(timeframe, bucketStartMs) });

  return (
    <BigNumberGroup
      ariaLabel="Invocation metrics"
      variant={BigNumberGroupVariant.PRIMARY}
      hasBorder
      fillWidth
      primary={
        <BigNumber
          label="Invocations"
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
        label="Avg duration"
        value={formatMillis(metrics.meanTotalMs)}
        isLoading={metrics.isTotalsLoading}
      />
      <BigNumber
        label="Avg acquire"
        value={formatMillis(metrics.meanAcquireMs)}
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

export default ObservabilityMetricsWidget;
