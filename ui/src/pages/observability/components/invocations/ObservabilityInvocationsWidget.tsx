import { type FC, useMemo } from "react";

import { ChartBarIcon } from "@phosphor-icons/react";

import BarChart from "@galaxy-io/dls/charts/BarChart";
import { type ChartSeriesStyles, ChartSwatch } from "@galaxy-io/dls/charts/types";
import Box from "@galaxy-io/dls/layout/Box";
import Widget from "@galaxy-io/dls/widget/Widget";

import { INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP } from "@/components/invocations/constants";

import type { ObservabilityInvocationsMetric } from "@/pages/observability/components/invocations/types";
import {
  createObservabilityInvocationsInput,
  mapTimeseriesToInvocationsGroups,
} from "@/pages/observability/components/invocations/utils";
import { OBSERVABILITY_CHART_HEIGHT } from "@/pages/observability/constants";
import { useObservabilityBucketStart } from "@/pages/observability/hooks/useObservabilityBucketStart";
import { getBucketLabelFormatter } from "@/pages/observability/utils";

import { useObservabilitySearch } from "@/module/hooks";

import { useQueryTimeseriesQuery } from "@/api/queries/metrics";

const OBSERVABILITY_INVOCATIONS_SERIES: ChartSeriesStyles<ObservabilityInvocationsMetric> = {
  invocations: { label: "Invocations" },
};

const ObservabilityInvocationsWidget: FC = () => {
  const { timeframe } = useObservabilitySearch();
  const { granularity } = INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe];
  const bucketStartMs = useObservabilityBucketStart(granularity);

  const input = useMemo(
    () => createObservabilityInvocationsInput(timeframe, bucketStartMs),
    [timeframe, bucketStartMs],
  );
  const { data, isLoading } = useQueryTimeseriesQuery({ input });

  const groups = useMemo(() => mapTimeseriesToInvocationsGroups(data?.series ?? []), [data]);

  return (
    <Widget header="Invocations" icon={ChartBarIcon} isFlush gap={0}>
      <Box height={OBSERVABILITY_CHART_HEIGHT} padding={[12, 16]}>
        <BarChart
          ariaLabel="Invocations by status"
          series={OBSERVABILITY_INVOCATIONS_SERIES}
          groups={groups}
          labelFormatter={getBucketLabelFormatter(granularity)}
          swatch={ChartSwatch.SQUARE}
          minSegmentLength={2}
          isFilterable
          isLoading={isLoading}
        />
      </Box>
    </Widget>
  );
};

export default ObservabilityInvocationsWidget;
