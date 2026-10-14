import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import {
  createConnectQueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useTransport,
} from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import {
  type GetInvocationRequest,
  GetInvocationRequestSchema,
  type GetInvocationResponse,
  type Invocation,
  type InvocationStatus,
  type ListInvocationsRequest,
  type ListInvocationsResponse,
} from "@/gen/functions/v1/invocations_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

import { ACTIVE_INVOCATIONS_REFETCH_INTERVAL } from "@/api/queries/constants";
import { createListInstancesQueryKey } from "@/api/queries/instances";
import { getNextPageParam, INITIAL_PAGE_PARAM, type InfiniteQueryInput } from "@/api/utils";

import { ACTIVE_INVOCATION_STATUSES } from "@/constants";

const getInvocationsRefetchInterval = (invocations: Invocation[] | undefined) => {
  return invocations?.some((invocation) => ACTIVE_INVOCATION_STATUSES.has(invocation.status))
    ? ACTIVE_INVOCATIONS_REFETCH_INTERVAL
    : false;
};

export const createListInvocationsInput = ({
  functionId,
  statuses = [],
  sinceMs = 0n,
}: {
  functionId?: AlchemyFunction["id"];
  statuses?: InvocationStatus[];
  sinceMs?: bigint;
}): InfiniteQueryInput<typeof FunctionsService.method.listInvocations.input> => ({
  functionIds: functionId ? [functionId] : [],
  statuses,
  sinceMs,
});

export const createListInvocationsQueryKey = (
  input?: ListInvocationsRequest,
  transport?: Transport,
) => {
  return createConnectQueryKey({
    schema: FunctionsService.method.listInvocations,
    input,
    transport,
    cardinality: undefined,
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
  return useQuery(FunctionsService.method.listInvocations, input, {
    refetchInterval: (query) => getInvocationsRefetchInterval(query.state.data?.invocations),
    ...options,
  });
};

export const useSuspenseListInvocationsInfiniteQuery = ({
  input,
}: {
  input?: InfiniteQueryInput<typeof FunctionsService.method.listInvocations.input>;
} = {}) => {
  return useSuspenseInfiniteQuery(
    FunctionsService.method.listInvocations,
    { ...input, pagination: INITIAL_PAGE_PARAM },
    {
      pageParamKey: "pagination",
      getNextPageParam,
      refetchInterval: (query) =>
        getInvocationsRefetchInterval(query.state.data?.pages.flatMap((page) => page.invocations)),
    },
  );
};

export const createGetInvocationInput = (id: Invocation["id"]) =>
  create(GetInvocationRequestSchema, { id });

const createGetInvocationQueryKey = (input?: GetInvocationRequest, transport?: Transport) => {
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
  return useQuery(FunctionsService.method.getInvocation, input, {
    refetchInterval: (query) => {
      const invocation = query.state.data?.invocation;
      return getInvocationsRefetchInterval(invocation ? [invocation] : undefined);
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
  const transport = useTransport();
  return useMutation(FunctionsService.method.invoke, {
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: createListInvocationsQueryKey(undefined, transport),
      });
      void queryClient.invalidateQueries({
        queryKey: createGetInvocationQueryKey(undefined, transport),
      });
      void queryClient.invalidateQueries({
        queryKey: createListInstancesQueryKey(undefined, transport),
      });
      return options.onSettled?.(...args);
    },
  });
};
