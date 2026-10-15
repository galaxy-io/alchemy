import type { FC } from "react";

import ChartGroupProvider from "@galaxy-io/dls/charts/ChartGroupProvider";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";
import PageLayout from "@galaxy-io/dls/layout/PageLayout";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";

import ObservabilityInvocationsWidget from "@/pages/observability/components/invocations/ObservabilityInvocationsWidget";
import ObservabilityLatencyWidget from "@/pages/observability/components/latency/ObservabilityLatencyWidget";
import ObservabilityLatestInvocationsWidget from "@/pages/observability/components/latest/ObservabilityLatestInvocationsWidget";
import ObservabilityMetricsWidget from "@/pages/observability/components/metrics/ObservabilityMetricsWidget";
import ObservabilityPageActions from "@/pages/observability/components/ObservabilityPageActions";
import ObservabilityTrafficWidget from "@/pages/observability/components/traffic/ObservabilityTrafficWidget";
import { OBSERVABILITY_CHART_MIN_WIDTH } from "@/pages/observability/constants";

const ObservabilityPage: FC = () => {
  return (
    <PageLayout header="Observability" actions={<ObservabilityPageActions />}>
      <ChartGroupProvider shouldShareTooltip>
        <ScrollArea>
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
        </ScrollArea>
      </ChartGroupProvider>
    </PageLayout>
  );
};

export default ObservabilityPage;
