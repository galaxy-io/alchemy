import type { FC } from "react";

import { css } from "@linaria/core";

import ChartGroupProvider from "@galaxy-io/dls/charts/ChartGroupProvider";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";
import PageLayout from "@galaxy-io/dls/layout/PageLayout";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import { HAIRLINE_WIDTH } from "@galaxy-io/dls/styles/mixins";

import ObservabilityHistoryWidget from "@/pages/observability/components/history/ObservabilityHistoryWidget";
import ObservabilityInvocationsWidget from "@/pages/observability/components/invocations/ObservabilityInvocationsWidget";
import ObservabilityLatencyWidget from "@/pages/observability/components/latency/ObservabilityLatencyWidget";
import ObservabilityMetricsWidget from "@/pages/observability/components/metrics/ObservabilityMetricsWidget";
import ObservabilityPageActions from "@/pages/observability/components/ObservabilityPageActions";
import ObservabilityTrafficWidget from "@/pages/observability/components/traffic/ObservabilityTrafficWidget";
import { OBSERVABILITY_CHART_MIN_WIDTH } from "@/pages/observability/constants";
import { useObservabilityScrollTakeover } from "@/pages/observability/hooks/useObservabilityScrollTakeover";

const OBSERVABILITY_PAGE_SCROLL_CSS = css`
  container-type: size;
`;

const OBSERVABILITY_HISTORY_TAKEOVER_HEIGHT = `calc(100cqh + ${HAIRLINE_WIDTH})`;

const ObservabilityPage: FC = () => {
  const { scrollRef, takeoverRef } = useObservabilityScrollTakeover();

  return (
    <PageLayout header="Observability" actions={<ObservabilityPageActions />}>
      <ChartGroupProvider shouldShareTooltip>
        <ScrollArea ref={scrollRef} className={OBSERVABILITY_PAGE_SCROLL_CSS}>
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
          </Flex>
          <Flex
            ref={takeoverRef}
            direction={FlexDirection.COLUMN}
            height={OBSERVABILITY_HISTORY_TAKEOVER_HEIGHT}
          >
            <ObservabilityHistoryWidget />
          </Flex>
        </ScrollArea>
      </ChartGroupProvider>
    </PageLayout>
  );
};

export default ObservabilityPage;
