import { useCallback } from "react";

import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import {
  createConnectQueryKey,
  type UseQueryOptions,
  useQuery,
  useTransport,
} from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import {
  GetQueueRequestSchema,
  Metric,
  MetricDimension,
  MetricFilterSchema,
  MetricsService,
  type QueryAggregateRequest,
  QueryAggregateRequestSchema,
  type QueryAggregateResponse,
  type QueryTimeseriesRequest,
  type QueryTimeseriesResponse,
} from "@/gen/metrics/v1/metrics_pb";

import {
  ACTIVE_INVOCATIONS_REFETCH_INTERVAL,
  METRICS_REFETCH_INTERVAL,
} from "@/api/queries/constants";
import { createListInvocationsQueryKey } from "@/api/queries/invocations";

const createQueryTimeseriesQueryKey = (input?: QueryTimeseriesRequest, transport?: Transport) => {
  return createConnectQueryKey({
    schema: MetricsService.method.queryTimeseries,
    input,
    transport,
    cardinality: "finite",
  });
};

const createQueryAggregateQueryKey = (input?: QueryAggregateRequest, transport?: Transport) => {
  return createConnectQueryKey({
    schema: MetricsService.method.queryAggregate,
    input,
    transport,
    cardinality: "finite",
  });
};

export const useQueryTimeseriesQuery = ({
  input,
  options = {},
}: {
  input?: QueryTimeseriesRequest;
  options?: UseQueryOptions<
    typeof MetricsService.method.queryTimeseries.output,
    QueryTimeseriesResponse
  >;
} = {}) => {
  return useQuery(MetricsService.method.queryTimeseries, input, {
    refetchInterval: METRICS_REFETCH_INTERVAL,
    ...options,
  });
};

export const useQueryAggregateQuery = ({
  input,
  options = {},
}: {
  input?: QueryAggregateRequest;
  options?: UseQueryOptions<
    typeof MetricsService.method.queryAggregate.output,
    QueryAggregateResponse
  >;
} = {}) => {
  return useQuery(MetricsService.method.queryAggregate, input, {
    refetchInterval: METRICS_REFETCH_INTERVAL,
    ...options,
  });
};

export const createGetQueueInput = (functionId?: AlchemyFunction["id"]) =>
  create(GetQueueRequestSchema, { functionIds: functionId ? [functionId] : [] });

export const useGetQueueQuery = ({ functionId }: { functionId?: AlchemyFunction["id"] } = {}) => {
  return useQuery(MetricsService.method.getQueue, createGetQueueInput(functionId), {
    refetchInterval: ACTIVE_INVOCATIONS_REFETCH_INTERVAL,
  });
};

export const createInvocationMetricsInputs = ({
  sinceMs,
  functionId,
}: {
  sinceMs: bigint;
  functionId?: AlchemyFunction["id"];
}) => {
  const filters = functionId
    ? [create(MetricFilterSchema, { dimension: MetricDimension.FUNCTION_ID, values: [functionId] })]
    : [];
  return {
    totalsInput: create(QueryAggregateRequestSchema, {
      metrics: [
        Metric.INVOCATION_COUNT,
        Metric.INVOCATION_TOTAL_DURATION,
        Metric.INVOCATION_ACQUIRE_DURATION,
      ],
      filters,
      sinceMs,
    }),
    statusInput: create(QueryAggregateRequestSchema, {
      metrics: [Metric.INVOCATION_COUNT],
      groupBy: MetricDimension.STATUS,
      filters,
      sinceMs,
    }),
    startKindInput: create(QueryAggregateRequestSchema, {
      metrics: [Metric.INVOCATION_COUNT],
      groupBy: MetricDimension.START_KIND,
      filters,
      sinceMs,
    }),
  };
};

export const useRefreshObservabilityQueries = () => {
  const queryClient = useQueryClient();
  const transport = useTransport();

  return useCallback(() => {
    for (const queryKey of [
      createQueryTimeseriesQueryKey(undefined, transport),
      createQueryAggregateQueryKey(undefined, transport),
      createListInvocationsQueryKey(undefined, transport),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, transport]);
};
