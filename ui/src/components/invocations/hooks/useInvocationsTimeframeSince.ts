import { useSyncExternalStore } from "react";

import {
  INVOCATIONS_MINUTE_MS,
  INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP,
} from "@/components/invocations/constants";
import type { InvocationsTimeframe } from "@/components/invocations/types";

const getMinuteStart = () => Math.floor(Date.now() / INVOCATIONS_MINUTE_MS) * INVOCATIONS_MINUTE_MS;

const subscribeToMinutes = (onMinuteChange: () => void) => {
  const interval = setInterval(onMinuteChange, INVOCATIONS_MINUTE_MS);
  return () => clearInterval(interval);
};

export const useInvocationsTimeframeSince = (timeframe: InvocationsTimeframe) => {
  const minuteStart = useSyncExternalStore(subscribeToMinutes, getMinuteStart);
  return BigInt(minuteStart - INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe].durationMs);
};
