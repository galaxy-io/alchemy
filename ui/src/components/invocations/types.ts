import type { MetricGranularity } from "@/gen/metrics/v1/metrics_pb";

export enum InvocationsTimeframe {
  ONE_HOUR = "1H",
  TWENTY_FOUR_HOURS = "24H",
  SEVEN_DAYS = "7D",
}

export interface InvocationsTimeframeConfig {
  label: string;
  durationMs: number;
  granularity: MetricGranularity;
}

export enum InvocationPhase {
  ACQUIRE = "ACQUIRE",
  RUN = "RUN",
  VALIDATE = "VALIDATE",
}
