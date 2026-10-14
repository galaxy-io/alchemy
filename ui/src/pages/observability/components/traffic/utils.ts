import { match } from "ts-pattern";

import type { HeatmapCellDatum } from "@galaxy-io/dls/charts/Heatmap";

import { type Invocation, StartKind } from "@/gen/functions/v1/invocations_pb";

import {
  OBSERVABILITY_TRAFFIC_DAYS,
  OBSERVABILITY_TRAFFIC_HOURS,
} from "@/pages/observability/components/traffic/constants";
import { ObservabilityTrafficFill } from "@/pages/observability/types";

import { formatCount, formatPercent } from "@/utils/format";

interface ObservabilityTrafficCount {
  total: number;
  cold: number;
}

const OBSERVABILITY_TRAFFIC_HOUR_LABEL_PATTERN = /^\d+$/;

const getObservabilityTrafficWeekday = (unixMillis: number) =>
  (new Date(unixMillis).getDay() + 6) % 7;

export const createObservabilityTrafficCells = (
  invocations: Invocation[],
  fill: ObservabilityTrafficFill,
): HeatmapCellDatum[] => {
  const counts = new Map<string, ObservabilityTrafficCount>();
  for (const invocation of invocations) {
    const createdAt = Number(invocation.createdAt);
    const key = `${getObservabilityTrafficWeekday(createdAt)}:${new Date(createdAt).getHours()}`;
    const count = counts.get(key) ?? { total: 0, cold: 0 };
    count.total += 1;
    if (invocation.startKind === StartKind.COLD_BOOT) count.cold += 1;
    counts.set(key, count);
  }
  return OBSERVABILITY_TRAFFIC_DAYS.flatMap((day, dayIndex) =>
    OBSERVABILITY_TRAFFIC_HOURS.map((hour) => {
      const count = counts.get(`${dayIndex}:${hour}`);
      const value = !count
        ? null
        : match(fill)
            .with(ObservabilityTrafficFill.VOLUME, () => count.total)
            .with(ObservabilityTrafficFill.COLD, () => count.cold / count.total)
            .exhaustive();
      return { row: day, column: hour, value };
    }),
  );
};

export const formatObservabilityTrafficLabel = (label: string) =>
  OBSERVABILITY_TRAFFIC_HOUR_LABEL_PATTERN.test(label) ? `${label.padStart(2, "0")}h` : label;

export const formatObservabilityTrafficValue = (value: number, fill: ObservabilityTrafficFill) =>
  match(fill)
    .with(ObservabilityTrafficFill.VOLUME, () => formatCount(Math.round(value)))
    .with(ObservabilityTrafficFill.COLD, () => formatPercent(value, 0))
    .exhaustive();
