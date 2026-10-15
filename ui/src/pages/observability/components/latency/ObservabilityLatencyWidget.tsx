import { type FC, useMemo } from "react";

import { TimerIcon } from "@phosphor-icons/react";

import LineChart from "@galaxy-io/dls/charts/LineChart";
import { ChartCurve, type ChartSeriesStyles, ChartSwatch } from "@galaxy-io/dls/charts/types";
import Box from "@galaxy-io/dls/layout/Box";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP,
  START_KIND_TO_CHART_PALETTE_MAP,
  START_KIND_TO_LABEL_MAP,
} from "@/components/invocations/constants";

import {
  createObservabilityLatencyInput,
  mapTimeseriesToLatencyLines,
} from "@/pages/observability/components/latency/utils";
import {
  OBSERVABILITY_CHART_HEIGHT,
  OBSERVABILITY_START_KINDS,
} from "@/pages/observability/constants";
import { useObservabilityBucketStart } from "@/pages/observability/hooks/useObservabilityBucketStart";
import { getBucketLabelFormatter } from "@/pages/observability/utils";

import { useObservabilitySearch } from "@/module/hooks";

import { useQueryTimeseriesQuery } from "@/api/queries/metrics";

import { formatMillis } from "@/utils/format";

const OBSERVABILITY_LATENCY_SERIES: ChartSeriesStyles<string> = Object.fromEntries(
  OBSERVABILITY_START_KINDS.map((kind) => [
    String(kind),
    { label: START_KIND_TO_LABEL_MAP[kind], color: START_KIND_TO_CHART_PALETTE_MAP[kind] },
  ]),
);

const ObservabilityLatencyWidget: FC = () => {
  const { timeframe } = useObservabilitySearch();
  const { granularity } = INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe];
  const bucketStartMs = useObservabilityBucketStart(granularity);

  const input = useMemo(
    () => createObservabilityLatencyInput(timeframe, bucketStartMs),
    [timeframe, bucketStartMs],
  );
  const { data, isLoading } = useQueryTimeseriesQuery({ input });

  const lines = useMemo(() => mapTimeseriesToLatencyLines(data?.series ?? []), [data]);

  return (
    <Widget header="Latency" icon={TimerIcon} isFlush gap={0}>
      <Box height={OBSERVABILITY_CHART_HEIGHT} padding={[12, 16]}>
        <LineChart
          ariaLabel="Mean latency by start kind"
          series={OBSERVABILITY_LATENCY_SERIES}
          lines={lines}
          curve={ChartCurve.SMOOTH}
          labelFormatter={getBucketLabelFormatter(granularity)}
          valueFormatter={formatMillis}
          swatch={ChartSwatch.SQUARE}
          isFilterable
          isLoading={isLoading}
        />
      </Box>
    </Widget>
  );
};

export default ObservabilityLatencyWidget;
