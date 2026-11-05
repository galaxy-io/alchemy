import type { FC } from "react";

import BigNumber from "@galaxy-io/dls/charts/BigNumber";
import BigNumberGroup, { BigNumberGroupVariant } from "@galaxy-io/dls/charts/BigNumberGroup";

import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import {
  INVOCATION_SETTLED_STATUSES,
  INVOCATION_STATUS_TO_LABEL_MAP,
  INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP,
} from "@/components/invocations/constants";
import { useInvocationMetrics } from "@/components/invocations/hooks/useInvocationMetrics";
import InvocationStatusSwatch from "@/components/invocations/InvocationStatusSwatch";

import { OBSERVABILITY_REFRESH_INTERVAL_TO_MS_MAP } from "@/pages/observability/constants";
import { useObservabilityBucketStart } from "@/pages/observability/hooks/useObservabilityBucketStart";
import { createTimeframeSince } from "@/pages/observability/utils";

import { useObservabilitySearch } from "@/module/hooks";

import { useGetQueueQuery } from "@/api/queries/metrics";

import { formatCount, formatMillis, formatRatio } from "@/utils/format";

const ObservabilityMetricsWidget: FC = () => {
  const { timeframe, refreshInterval } = useObservabilitySearch();
  const bucketStartMs = useObservabilityBucketStart(
    INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe].granularity,
  );
  const metrics = useInvocationMetrics({
    sinceMs: createTimeframeSince(timeframe, bucketStartMs),
    refetchInterval: OBSERVABILITY_REFRESH_INTERVAL_TO_MS_MAP[refreshInterval],
  });
  const { data: queue, isLoading: isQueueLoading } = useGetQueueQuery();

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
      <BigNumber
        label={INVOCATION_STATUS_TO_LABEL_MAP[InvocationStatus.PENDING]}
        value={formatCount(Number(queue?.queued ?? 0n))}
        suffix={<InvocationStatusSwatch status={InvocationStatus.PENDING} />}
        isLoading={isQueueLoading}
      />
      <BigNumber
        label={INVOCATION_STATUS_TO_LABEL_MAP[InvocationStatus.RUNNING]}
        value={formatCount(Number(queue?.running ?? 0n))}
        suffix={<InvocationStatusSwatch status={InvocationStatus.RUNNING} />}
        isLoading={isQueueLoading}
      />
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
