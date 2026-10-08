import type { Transport } from "@connectrpc/connect";
import {
  createConnectQueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useSuspenseQuery,
} from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

import type {
  GetInvocationRequest,
  GetInvocationResponse,
  Invocation,
  ListInvocationsRequest,
  ListInvocationsResponse,
} from "@/gen/functions/v1/invocations_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

import { ACTIVE_INVOCATION_STATUSES } from "@/api/queries/constants";
import { createListInstancesQueryKey } from "@/api/queries/instances";

const ACTIVE_INVOCATIONS_REFETCH_INTERVAL = 1000;
const IDLE_INVOCATIONS_REFETCH_INTERVAL = 3000;

const getInvocationsRefetchInterval = (invocations: (Invocation | undefined)[] | undefined) => {
  if (!invocations) return false;
  return invocations.some(
    (invocation) => invocation && ACTIVE_INVOCATION_STATUSES.has(invocation.status),
  )
    ? ACTIVE_INVOCATIONS_REFETCH_INTERVAL
    : IDLE_INVOCATIONS_REFETCH_INTERVAL;
};

export const createListInvocationsQueryKey = (
  input?: ListInvocationsRequest,
  transport?: Transport,
) => {
  return createConnectQueryKey({
    schema: FunctionsService.method.listInvocations,
    input,
    transport,
    cardinality: "finite",
  });
};

export const useListInvocationsQuery = ({
  input,
  options = {},
}: {
  input?: ListInvocationsRequest;
  options?: UseQueryOptions<
    typeof FunctionsService.method.listInvocations.output,
    ListInvocationsResponse
  >;
} = {}) => {
  return useQuery<
    typeof FunctionsService.method.listInvocations.input,
    typeof FunctionsService.method.listInvocations.output
  >(FunctionsService.method.listInvocations, input, {
    refetchInterval: (query) => getInvocationsRefetchInterval(query.state.data?.invocations),
    ...options,
  });
};

export const useSuspenseListInvocationsQuery = ({
  input,
}: {
  input?: ListInvocationsRequest;
} = {}) => {
  return useSuspenseQuery<
    typeof FunctionsService.method.listInvocations.input,
    typeof FunctionsService.method.listInvocations.output
  >(FunctionsService.method.listInvocations, input, {
    refetchInterval: (query) => getInvocationsRefetchInterval(query.state.data?.invocations),
  });
};

export const createGetInvocationQueryKey = (
  input?: GetInvocationRequest,
  transport?: Transport,
) => {
  return createConnectQueryKey({
    schema: FunctionsService.method.getInvocation,
    input,
    transport,
    cardinality: "finite",
  });
};

export const useGetInvocationQuery = ({
  input,
  options = {},
}: {
  input: GetInvocationRequest;
  options?: UseQueryOptions<
    typeof FunctionsService.method.getInvocation.output,
    GetInvocationResponse
  >;
}) => {
  return useQuery<
    typeof FunctionsService.method.getInvocation.input,
    typeof FunctionsService.method.getInvocation.output
  >(FunctionsService.method.getInvocation, input, {
    refetchInterval: (query) => {
      const invocation = query.state.data?.invocation;
      return invocation && ACTIVE_INVOCATION_STATUSES.has(invocation.status)
        ? ACTIVE_INVOCATIONS_REFETCH_INTERVAL
        : false;
    },
    ...options,
  });
};

export const useInvokeMutation = (
  options: UseMutationOptions<
    typeof FunctionsService.method.invoke.input,
    typeof FunctionsService.method.invoke.output
  > = {},
) => {
  const queryClient = useQueryClient();
  return useMutation<
    typeof FunctionsService.method.invoke.input,
    typeof FunctionsService.method.invoke.output
  >(FunctionsService.method.invoke, {
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({ queryKey: createListInvocationsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: createGetInvocationQueryKey() });
      void queryClient.invalidateQueries({ queryKey: createListInstancesQueryKey() });
      return options.onSettled?.(...args);
    },
  });
};
