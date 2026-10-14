import { useMemo } from "react";

import MetricGroup from "@/components/metrics/MetricGroup";

import InvocationStatusSwatch from "@/pages/invocations/components/InvocationStatusSwatch";
import {
  INVOCATION_STATUS_TO_LABEL_MAP,
  INVOCATIONS_DEFAULT_TIMEFRAME,
} from "@/pages/invocations/constants";
import {
  countInvocationsByStatus,
  filterInvocationsInTimeframe,
  getInvocationDurations,
  getPercentile,
  getWarmRate,
} from "@/pages/invocations/utils";
import { OBSERVABILITY_INVOCATION_STATUSES } from "@/pages/observability/constants";

import { useSuspenseListInvocationsQuery } from "@/api/queries/invocations";

import { useObservabilitySearch } from "@/module/hooks";
import { formatCount, formatMicros, formatPercent } from "@/utils/format";

const ObservabilityMetricsWidget = () => {
  const { timeframe = INVOCATIONS_DEFAULT_TIMEFRAME } = useObservabilitySearch();
  const { data } = useSuspenseListInvocationsQuery();

  const invocations = useMemo(
    () => filterInvocationsInTimeframe(data.invocations, timeframe),
    [data.invocations, timeframe],
  );
  const counts = countInvocationsByStatus(invocations);
  const durations = getInvocationDurations(invocations, "totalUs");

  return (
    <MetricGroup
      primary={{ label: "Invocations", value: formatCount(invocations.length) }}
      tiles={[
        ...OBSERVABILITY_INVOCATION_STATUSES.map((status) => ({
          label: INVOCATION_STATUS_TO_LABEL_MAP[status],
          value: formatCount(counts[status]),
          mark: <InvocationStatusSwatch status={status} />,
        })),
        { label: "p50", value: formatMicros(getPercentile(durations, 50)) },
        { label: "p95", value: formatMicros(getPercentile(durations, 95)) },
        { label: "Warm", value: formatPercent(getWarmRate(invocations), 0) },
      ]}
    />
  );
};

export default ObservabilityMetricsWidget;
