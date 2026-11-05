import { type FC, useMemo } from "react";

import { CalendarDotsIcon } from "@phosphor-icons/react";

import Heatmap from "@galaxy-io/dls/charts/Heatmap";
import ToggleInput, { ToggleInputSize } from "@galaxy-io/dls/inputs/ToggleInput";
import Box from "@galaxy-io/dls/layout/Box";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  OBSERVABILITY_TRAFFIC_DAYS,
  OBSERVABILITY_TRAFFIC_FILL_OPTIONS,
  OBSERVABILITY_TRAFFIC_FILL_TO_COLOR_MAP,
  OBSERVABILITY_TRAFFIC_FILL_TO_LABEL_MAP,
  OBSERVABILITY_TRAFFIC_GRANULARITY,
  OBSERVABILITY_TRAFFIC_HOURS,
} from "@/pages/observability/components/traffic/constants";
import {
  createObservabilityTrafficCells,
  createObservabilityTrafficInput,
  formatObservabilityTrafficLabel,
  formatObservabilityTrafficValue,
} from "@/pages/observability/components/traffic/utils";
import {
  OBSERVABILITY_CHART_HEIGHT,
  OBSERVABILITY_DEFAULT_TRAFFIC_FILL,
  OBSERVABILITY_REFRESH_INTERVAL_TO_MS_MAP,
} from "@/pages/observability/constants";
import { useObservabilityBucketStart } from "@/pages/observability/hooks/useObservabilityBucketStart";
import type { ObservabilityTrafficFill } from "@/pages/observability/types";

import { useAlchemySearchUpdate, useObservabilitySearch } from "@/module/hooks";
import type { ObservabilitySearch } from "@/module/schemas";

import { useQueryTimeseriesQuery } from "@/api/queries/metrics";

const ObservabilityTrafficWidget: FC = () => {
  const updateSearch = useAlchemySearchUpdate<ObservabilitySearch>();
  const { traffic: fill, refreshInterval } = useObservabilitySearch();
  const bucketStartMs = useObservabilityBucketStart(OBSERVABILITY_TRAFFIC_GRANULARITY);

  const input = useMemo(() => createObservabilityTrafficInput(bucketStartMs), [bucketStartMs]);
  const { data, isLoading } = useQueryTimeseriesQuery({
    input,
    options: { refetchInterval: OBSERVABILITY_REFRESH_INTERVAL_TO_MS_MAP[refreshInterval] },
  });

  const cells = useMemo(
    () => createObservabilityTrafficCells(data?.series ?? [], fill),
    [data, fill],
  );

  const handleFillChange = (next: ObservabilityTrafficFill) => {
    void updateSearch(
      (prev) => ({
        ...prev,
        traffic: next === OBSERVABILITY_DEFAULT_TRAFFIC_FILL ? undefined : next,
      }),
      { replace: true },
    );
  };

  return (
    <Widget
      header="Traffic"
      icon={CalendarDotsIcon}
      isFlush
      gap={0}
      actions={
        <ToggleInput
          ariaLabel="Heatmap fill"
          size={ToggleInputSize.SMALL}
          options={OBSERVABILITY_TRAFFIC_FILL_OPTIONS}
          value={fill}
          onChange={handleFillChange}
        />
      }
    >
      <Box height={OBSERVABILITY_CHART_HEIGHT} padding={[12, 16]}>
        <Heatmap
          ariaLabel={`${OBSERVABILITY_TRAFFIC_FILL_TO_LABEL_MAP[fill]} by weekday and hour, last 7 days`}
          cells={cells}
          rows={OBSERVABILITY_TRAFFIC_DAYS}
          columns={OBSERVABILITY_TRAFFIC_HOURS}
          color={OBSERVABILITY_TRAFFIC_FILL_TO_COLOR_MAP[fill]}
          labelFormatter={formatObservabilityTrafficLabel}
          valueFormatter={(value) => formatObservabilityTrafficValue(value, fill)}
          hasLegend={false}
          isLoading={isLoading}
        />
      </Box>
    </Widget>
  );
};

export default ObservabilityTrafficWidget;
