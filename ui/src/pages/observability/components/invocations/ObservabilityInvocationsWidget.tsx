import { useMemo } from "react";

import BarChart from "@galaxy-io/dls/charts/BarChart";
import { ChartSwatch } from "@galaxy-io/dls/charts/types";
import Box from "@galaxy-io/dls/layout/Box";
import Widget from "@galaxy-io/dls/widget/Widget";

import { INVOCATIONS_DEFAULT_TIMEFRAME } from "@/pages/invocations/constants";
import { bucketizeInvocations } from "@/pages/invocations/utils";
import { OBSERVABILITY_CHART_HEIGHT } from "@/pages/observability/constants";
import { createObservabilityInvocationsGroups } from "@/pages/observability/utils";

import { useSuspenseListInvocationsQuery } from "@/api/queries/invocations";

import { useObservabilitySearch } from "@/module/hooks";
import { formatCount } from "@/utils/format";

const OBSERVABILITY_INVOCATIONS_SERIES = { invocations: { label: "Invocations" } };

const ObservabilityInvocationsWidget = () => {
  const { timeframe = INVOCATIONS_DEFAULT_TIMEFRAME } = useObservabilitySearch();
  const { data } = useSuspenseListInvocationsQuery();

  const groups = useMemo(
    () => createObservabilityInvocationsGroups(bucketizeInvocations(data.invocations, timeframe)),
    [data.invocations, timeframe],
  );

  return (
    <Widget header="Invocations" isFlush gap={0}>
      <Box height={OBSERVABILITY_CHART_HEIGHT} padding={[12, 16]}>
        <BarChart
          ariaLabel="Invocations by status"
          series={OBSERVABILITY_INVOCATIONS_SERIES}
          groups={groups}
          swatch={ChartSwatch.SQUARE}
          hasLegend
          isFilterable
          minSegmentLength={2}
          valueFormatter={(value) => formatCount(Math.round(value))}
        />
      </Box>
    </Widget>
  );
};

export default ObservabilityInvocationsWidget;
