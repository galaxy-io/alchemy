import { useMemo } from "react";

import Heatmap from "@galaxy-io/dls/charts/Heatmap";
import ToggleInput, { ToggleInputSize } from "@galaxy-io/dls/inputs/ToggleInput";
import Box from "@galaxy-io/dls/layout/Box";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  OBSERVABILITY_TRAFFIC_DAYS,
  OBSERVABILITY_TRAFFIC_FILL_OPTIONS,
  OBSERVABILITY_TRAFFIC_FILL_TO_COLOR_MAP,
  OBSERVABILITY_TRAFFIC_FILL_TO_LABEL_MAP,
  OBSERVABILITY_TRAFFIC_HOURS,
} from "@/pages/observability/components/traffic/constants";
import {
  createObservabilityTrafficCells,
  formatObservabilityTrafficLabel,
  formatObservabilityTrafficValue,
} from "@/pages/observability/components/traffic/utils";
import {
  OBSERVABILITY_CHART_HEIGHT,
  OBSERVABILITY_DEFAULT_TRAFFIC_FILL,
} from "@/pages/observability/constants";
import type { ObservabilityTrafficFill } from "@/pages/observability/types";

import { useSuspenseListInvocationsQuery } from "@/api/queries/invocations";

import { useAlchemySearchUpdate, useObservabilitySearch } from "@/module/hooks";
import type { ObservabilitySearch } from "@/module/schemas";

const ObservabilityTrafficWidget = () => {
  const updateSearch = useAlchemySearchUpdate<ObservabilitySearch>();
  const { traffic: fill = OBSERVABILITY_DEFAULT_TRAFFIC_FILL } = useObservabilitySearch();
  const { data } = useSuspenseListInvocationsQuery();

  const cells = useMemo(
    () => createObservabilityTrafficCells(data.invocations, fill),
    [data.invocations, fill],
  );

  const handleFillChange = (nextFill: ObservabilityTrafficFill) => {
    void updateSearch(
      (prev) => ({
        ...prev,
        traffic: nextFill === OBSERVABILITY_DEFAULT_TRAFFIC_FILL ? undefined : nextFill,
      }),
      { replace: true },
    );
  };

  return (
    <Widget
      header="Traffic"
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
        />
      </Box>
    </Widget>
  );
};

export default ObservabilityTrafficWidget;
