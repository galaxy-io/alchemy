import ChartGroupProvider from "@galaxy-io/dls/charts/ChartGroupProvider";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";

import PageLayout from "@/layouts/page/PageLayout";

import InvocationsTimeframeToggle from "@/pages/invocations/components/InvocationsTimeframeToggle";
import { INVOCATIONS_DEFAULT_TIMEFRAME } from "@/pages/invocations/constants";
import type { InvocationsTimeframe } from "@/pages/invocations/types";
import ObservabilityInvocationsWidget from "@/pages/observability/components/invocations/ObservabilityInvocationsWidget";
import ObservabilityLatencyWidget from "@/pages/observability/components/latency/ObservabilityLatencyWidget";
import ObservabilityLatestInvocationsWidget from "@/pages/observability/components/latest/ObservabilityLatestInvocationsWidget";
import ObservabilityMetricsWidget from "@/pages/observability/components/metrics/ObservabilityMetricsWidget";
import ObservabilityTrafficWidget from "@/pages/observability/components/traffic/ObservabilityTrafficWidget";
import { OBSERVABILITY_CHART_MIN_WIDTH } from "@/pages/observability/constants";

import { useAlchemySearchUpdate, useObservabilitySearch } from "@/module/hooks";
import type { ObservabilitySearch } from "@/module/schemas";

const ObservabilityPage = () => {
  const updateSearch = useAlchemySearchUpdate<ObservabilitySearch>();
  const { timeframe = INVOCATIONS_DEFAULT_TIMEFRAME } = useObservabilitySearch();

  const handleTimeframeChange = (nextTimeframe: InvocationsTimeframe) => {
    void updateSearch(
      (prev) => ({
        ...prev,
        timeframe: nextTimeframe === INVOCATIONS_DEFAULT_TIMEFRAME ? undefined : nextTimeframe,
      }),
      { replace: true },
    );
  };

  return (
    <PageLayout
      title="Observability"
      actions={<InvocationsTimeframeToggle value={timeframe} onChange={handleTimeframeChange} />}
    >
      <ChartGroupProvider shouldShareTooltip>
        <Flex direction={FlexDirection.COLUMN} gap={12} padding={16}>
          <ObservabilityMetricsWidget />
          <Grid
            columns={`repeat(auto-fit, minmax(${OBSERVABILITY_CHART_MIN_WIDTH}px, 1fr))`}
            gap={12}
          >
            <ObservabilityInvocationsWidget />
            <ObservabilityLatencyWidget />
          </Grid>
          <ObservabilityTrafficWidget />
          <ObservabilityLatestInvocationsWidget />
        </Flex>
      </ChartGroupProvider>
    </PageLayout>
  );
};

export default ObservabilityPage;
