import { type FC, useMemo } from "react";

import { ChartBarIcon } from "@phosphor-icons/react";

import BarChart from "@galaxy-io/dls/charts/BarChart";
import {
  type ChartSelection,
  type ChartSelectionInput,
  ChartSwatch,
} from "@galaxy-io/dls/charts/types";
import Box from "@galaxy-io/dls/layout/Box";
import Widget from "@galaxy-io/dls/widget/Widget";

import { INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP } from "@/components/invocations/constants";

import {
  OBSERVABILITY_INVOCATIONS_GROUP_TO_ARIA_LABEL_MAP,
  OBSERVABILITY_INVOCATIONS_LABEL,
  OBSERVABILITY_INVOCATIONS_SERIES,
} from "@/pages/observability/components/invocations/constants";
import ObservabilityInvocationsGroupSelect from "@/pages/observability/components/invocations/ObservabilityInvocationsGroupSelect";
import {
  createObservabilityInvocationsInput,
  getObservabilityInvocationsFunctionIds,
  getObservabilityInvocationsSeriesKey,
  mapChartSelectionToInvocationsFilter,
  mapTimeseriesToInvocationsGroups,
} from "@/pages/observability/components/invocations/utils";
import {
  OBSERVABILITY_CHART_HEIGHT,
  OBSERVABILITY_REFRESH_INTERVAL_TO_MS_MAP,
} from "@/pages/observability/constants";
import { useObservabilityBucketStart } from "@/pages/observability/hooks/useObservabilityBucketStart";
import { useObservabilityFunctionsById } from "@/pages/observability/hooks/useObservabilityFunctionsById";
import { getBucketLabelFormatter } from "@/pages/observability/utils";

import { useAlchemySearchUpdate, useObservabilitySearch } from "@/module/hooks";
import type { ObservabilitySearch } from "@/module/schemas";

import { useQueryTimeseriesQuery } from "@/api/queries/metrics";

const ObservabilityInvocationsWidget: FC = () => {
  const updateSearch = useAlchemySearchUpdate<ObservabilitySearch>();
  const {
    timeframe,
    invocationsBucket,
    invocationsStatus,
    invocationsGroup,
    invocationsFunction,
    refreshInterval,
  } = useObservabilitySearch();
  const { granularity } = INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe];
  const bucketStartMs = useObservabilityBucketStart(granularity);

  const input = useMemo(
    () => createObservabilityInvocationsInput(timeframe, bucketStartMs, invocationsGroup),
    [timeframe, bucketStartMs, invocationsGroup],
  );
  const { data, isLoading } = useQueryTimeseriesQuery({
    input,
    options: { refetchInterval: OBSERVABILITY_REFRESH_INTERVAL_TO_MS_MAP[refreshInterval] },
  });

  const functionIds = useMemo(
    () => getObservabilityInvocationsFunctionIds(invocationsGroup, data?.series ?? []),
    [invocationsGroup, data],
  );
  const { functionsById, isLoading: isFunctionsLoading } =
    useObservabilityFunctionsById(functionIds);

  const groups = useMemo(
    () => mapTimeseriesToInvocationsGroups(invocationsGroup, data?.series ?? [], functionsById),
    [invocationsGroup, data, functionsById],
  );

  const selection = useMemo<ChartSelectionInput>(() => {
    const seriesKey = getObservabilityInvocationsSeriesKey(
      invocationsGroup,
      invocationsStatus,
      invocationsFunction,
    );
    return invocationsBucket === undefined && seriesKey === undefined
      ? null
      : { categoryKey: invocationsBucket?.toString(), seriesKey };
  }, [invocationsGroup, invocationsBucket, invocationsStatus, invocationsFunction]);

  const handleSelectionChange = (next: ChartSelection[]) => {
    const filter = mapChartSelectionToInvocationsFilter(invocationsGroup, next[next.length - 1]);
    void updateSearch((prev) => ({ ...prev, ...filter }));
  };

  return (
    <Widget
      header={OBSERVABILITY_INVOCATIONS_LABEL}
      icon={ChartBarIcon}
      actions={<ObservabilityInvocationsGroupSelect />}
      isFlush
      gap={0}
    >
      <Box height={OBSERVABILITY_CHART_HEIGHT} padding={[12, 16]}>
        <BarChart
          ariaLabel={OBSERVABILITY_INVOCATIONS_GROUP_TO_ARIA_LABEL_MAP[invocationsGroup]}
          series={OBSERVABILITY_INVOCATIONS_SERIES}
          groups={groups}
          labelFormatter={getBucketLabelFormatter(granularity)}
          swatch={ChartSwatch.SQUARE}
          minSegmentLength={2}
          selection={selection}
          onSelectionChange={handleSelectionChange}
          isFilterable
          isLoading={isLoading || isFunctionsLoading}
        />
      </Box>
    </Widget>
  );
};

export default ObservabilityInvocationsWidget;
