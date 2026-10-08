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
  Function as AlchemyFunction,
  GetFunctionRequest,
  GetFunctionResponse,
  ListFunctionsRequest,
  ListFunctionsResponse,
} from "@/gen/functions/v1/functions_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

import { ACTIVE_FUNCTION_VERSION_STATUSES } from "@/api/queries/constants";
import { createListInvocationsQueryKey } from "@/api/queries/invocations";

const BUILDING_FUNCTIONS_REFETCH_INTERVAL = 1000;

const getFunctionsRefetchInterval = (functions: (AlchemyFunction | undefined)[]) =>
  functions.some((fn) =>
    fn?.versions.some((version) => ACTIVE_FUNCTION_VERSION_STATUSES.has(version.status)),
  )
    ? BUILDING_FUNCTIONS_REFETCH_INTERVAL
    : false;

export const createListFunctionsQueryKey = (
  input?: ListFunctionsRequest,
  transport?: Transport,
) => {
  return createConnectQueryKey({
    schema: FunctionsService.method.listFunctions,
    input,
    transport,
    cardinality: "finite",
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
  return useQuery<
    typeof FunctionsService.method.listFunctions.input,
    typeof FunctionsService.method.listFunctions.output
  >(FunctionsService.method.listFunctions, input, {
    refetchInterval: (query) => getFunctionsRefetchInterval(query.state.data?.functions ?? []),
    ...options,
  });
};

export const useSuspenseListFunctionsQuery = ({ input }: { input?: ListFunctionsRequest } = {}) => {
  return useSuspenseQuery<
    typeof FunctionsService.method.listFunctions.input,
    typeof FunctionsService.method.listFunctions.output
  >(FunctionsService.method.listFunctions, input, {
    refetchInterval: (query) => getFunctionsRefetchInterval(query.state.data?.functions ?? []),
  });
};

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
  return useQuery<
    typeof FunctionsService.method.getFunction.input,
    typeof FunctionsService.method.getFunction.output
  >(FunctionsService.method.getFunction, input, {
    refetchInterval: (query) => getFunctionsRefetchInterval([query.state.data?.function]),
    ...options,
  });
};

export const useSuspenseGetFunctionQuery = ({ input }: { input: GetFunctionRequest }) => {
  return useSuspenseQuery<
    typeof FunctionsService.method.getFunction.input,
    typeof FunctionsService.method.getFunction.output
  >(FunctionsService.method.getFunction, input, {
    refetchInterval: (query) => getFunctionsRefetchInterval([query.state.data?.function]),
  });
};

export const useCreateFunctionMutation = (
  options: UseMutationOptions<
    typeof FunctionsService.method.createFunction.input,
    typeof FunctionsService.method.createFunction.output
  > = {},
) => {
  const queryClient = useQueryClient();
  return useMutation<
    typeof FunctionsService.method.createFunction.input,
    typeof FunctionsService.method.createFunction.output
  >(FunctionsService.method.createFunction, {
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({ queryKey: createListFunctionsQueryKey() });
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
  return useMutation<
    typeof FunctionsService.method.updateFunction.input,
    typeof FunctionsService.method.updateFunction.output
  >(FunctionsService.method.updateFunction, {
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({ queryKey: createListFunctionsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: createGetFunctionQueryKey() });
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
  return useMutation<
    typeof FunctionsService.method.deleteFunction.input,
    typeof FunctionsService.method.deleteFunction.output
  >(FunctionsService.method.deleteFunction, {
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({ queryKey: createListFunctionsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: createGetFunctionQueryKey() });
      void queryClient.invalidateQueries({ queryKey: createListInvocationsQueryKey() });
      return options.onSettled?.(...args);
    },
  });
};
