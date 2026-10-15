import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import {
  createConnectQueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
  useTransport,
} from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

import {
  type Function as AlchemyFunction,
  FunctionVersionStatus,
  type GetFunctionRequest,
  GetFunctionRequestSchema,
  type GetFunctionResponse,
  type ListFunctionsRequest,
  type ListFunctionsResponse,
} from "@/gen/functions/v1/functions_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

import type { ListSearchParams } from "@/module/schemas";

import { BUILDING_VERSIONS_REFETCH_INTERVAL } from "@/api/queries/constants";
import { createListInvocationsQueryKey } from "@/api/queries/invocations";
import {
  createListSearchInput,
  getNextPageParam,
  INITIAL_PAGE_PARAM,
  type InfiniteQueryInput,
} from "@/api/utils";

export const createListFunctionsInput = (search: ListSearchParams) => createListSearchInput(search);

export const createListFunctionsQueryKey = (
  input?: ListFunctionsRequest,
  transport?: Transport,
) => {
  return createConnectQueryKey({
    schema: FunctionsService.method.listFunctions,
    input,
    transport,
    cardinality: undefined,
  });
};

export const useListFunctionsQuery = ({
  input,
  options = {},
}: {
  input?: ListFunctionsRequest;
  options?: UseQueryOptions<
    typeof FunctionsService.method.listFunctions.output,
    ListFunctionsResponse
  >;
} = {}) => {
  return useQuery(FunctionsService.method.listFunctions, input, options);
};

export const useSuspenseListFunctionsInfiniteQuery = ({
  input,
}: {
  input?: InfiniteQueryInput<typeof FunctionsService.method.listFunctions.input>;
} = {}) => {
  return useSuspenseInfiniteQuery(
    FunctionsService.method.listFunctions,
    { ...input, pagination: INITIAL_PAGE_PARAM },
    {
      pageParamKey: "pagination",
      getNextPageParam,
    },
  );
};

const getGetFunctionRefetchInterval = (alchemyFunction: AlchemyFunction | undefined) => {
  return alchemyFunction?.versions.some(
    (version) => version.status === FunctionVersionStatus.BUILDING,
  )
    ? BUILDING_VERSIONS_REFETCH_INTERVAL
    : false;
};

export const createGetFunctionInput = (id: AlchemyFunction["id"]) =>
  create(GetFunctionRequestSchema, { id, includeVersions: true });

export const createGetFunctionQueryKey = (input?: GetFunctionRequest, transport?: Transport) => {
  return createConnectQueryKey({
    schema: FunctionsService.method.getFunction,
    input,
    transport,
    cardinality: "finite",
  });
};

export const useGetFunctionQuery = ({
  input,
  options = {},
}: {
  input: GetFunctionRequest;
  options?: UseQueryOptions<typeof FunctionsService.method.getFunction.output, GetFunctionResponse>;
}) => {
  return useQuery(FunctionsService.method.getFunction, input, {
    refetchInterval: (query) => getGetFunctionRefetchInterval(query.state.data?.function),
    ...options,
  });
};

export const useSuspenseGetFunctionQuery = ({ input }: { input: GetFunctionRequest }) => {
  return useSuspenseQuery(FunctionsService.method.getFunction, input, {
    refetchInterval: (query) => getGetFunctionRefetchInterval(query.state.data?.function),
  });
};

export const useCreateFunctionMutation = (
  options: UseMutationOptions<
    typeof FunctionsService.method.createFunction.input,
    typeof FunctionsService.method.createFunction.output
  > = {},
) => {
  const queryClient = useQueryClient();
  const transport = useTransport();
  return useMutation(FunctionsService.method.createFunction, {
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: createListFunctionsQueryKey(undefined, transport),
      });
      return options.onSettled?.(...args);
    },
  });
};

export const useUpdateFunctionMutation = (
  options: UseMutationOptions<
    typeof FunctionsService.method.updateFunction.input,
    typeof FunctionsService.method.updateFunction.output
  > = {},
) => {
  const queryClient = useQueryClient();
  const transport = useTransport();
  return useMutation(FunctionsService.method.updateFunction, {
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: createListFunctionsQueryKey(undefined, transport),
      });
      void queryClient.invalidateQueries({
        queryKey: createGetFunctionQueryKey(undefined, transport),
      });
      return options.onSettled?.(...args);
    },
  });
};

export const useDeleteFunctionMutation = (
  options: UseMutationOptions<
    typeof FunctionsService.method.deleteFunction.input,
    typeof FunctionsService.method.deleteFunction.output
  > = {},
) => {
  const queryClient = useQueryClient();
  const transport = useTransport();
  return useMutation(FunctionsService.method.deleteFunction, {
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: createListFunctionsQueryKey(undefined, transport),
      });
      void queryClient.invalidateQueries({
        queryKey: createGetFunctionQueryKey(undefined, transport),
      });
      void queryClient.invalidateQueries({
        queryKey: createListInvocationsQueryKey(undefined, transport),
      });
      return options.onSettled?.(...args);
    },
  });
};
