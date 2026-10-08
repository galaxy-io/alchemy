import { useMemo } from "react";

import LineChart from "@galaxy-io/dls/charts/LineChart";
import { ChartCurve, ChartSwatch } from "@galaxy-io/dls/charts/types";
import Box from "@galaxy-io/dls/layout/Box";
import Widget from "@galaxy-io/dls/widget/Widget";

import { INVOCATIONS_DEFAULT_TIMEFRAME } from "@/pages/invocations/constants";
import { bucketizeInvocations } from "@/pages/invocations/utils";
import {
  OBSERVABILITY_CHART_HEIGHT,
  OBSERVABILITY_LATENCY_SERIES,
} from "@/pages/observability/constants";
import { createObservabilityLatencyLines } from "@/pages/observability/utils";

import { useSuspenseListInvocationsQuery } from "@/api/queries/invocations";

import { useObservabilitySearch } from "@/module/hooks";
import { formatMillis } from "@/utils/format";

const ObservabilityLatencyWidget = () => {
  const { timeframe = INVOCATIONS_DEFAULT_TIMEFRAME } = useObservabilitySearch();
  const { data } = useSuspenseListInvocationsQuery();

  const lines = useMemo(
    () => createObservabilityLatencyLines(bucketizeInvocations(data.invocations, timeframe)),
    [data.invocations, timeframe],
  );

  return (
    <Widget header="Latency" isFlush gap={0}>
      <Box height={OBSERVABILITY_CHART_HEIGHT} padding={[12, 16]}>
        <LineChart
          ariaLabel="p50 latency by start kind"
          series={OBSERVABILITY_LATENCY_SERIES}
          lines={lines}
          curve={ChartCurve.SMOOTH}
          swatch={ChartSwatch.SQUARE}
          hasLegend
          isFilterable
          valueFormatter={formatMillis}
        />
      </Box>
    </Widget>
  );
};

export default ObservabilityLatencyWidget;
