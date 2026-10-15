import { useCallback, useSyncExternalStore } from "react";

import type { MetricGranularity } from "@/gen/metrics/v1/metrics_pb";

import { getBucketStart, getNextBucketStart } from "@/pages/observability/utils";

export const useObservabilityBucketStart = (granularity: MetricGranularity) => {
  const subscribe = useCallback(
    (onBucketChange: () => void) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const scheduleNextBucket = () => {
        const nextBucketStartMs = getNextBucketStart(
          granularity,
          getBucketStart(granularity, new Date()),
        );
        timeout = setTimeout(() => {
          onBucketChange();
          scheduleNextBucket();
        }, nextBucketStartMs - Date.now());
      };
      scheduleNextBucket();
      return () => clearTimeout(timeout);
    },
    [granularity],
  );

  const getSnapshot = useCallback(
    () => getBucketStart(granularity, new Date()).getTime(),
    [granularity],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
};
