import { create } from "@bufbuild/protobuf";
import {
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useTransport,
} from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

import {
  type Function as AlchemyFunction,
  type FunctionVersion,
  type GetFunctionVersionRequest,
  GetFunctionVersionRequestSchema,
  type GetFunctionVersionResponse,
} from "@/gen/functions/v1/functions_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

import { createGetFunctionQueryKey, createListFunctionsQueryKey } from "@/api/queries/functions";

export const useCreateFunctionVersionMutation = (
  options: UseMutationOptions<
    typeof FunctionsService.method.createFunctionVersion.input,
    typeof FunctionsService.method.createFunctionVersion.output
  > = {},
) => {
  const queryClient = useQueryClient();
  const transport = useTransport();
  return useMutation(FunctionsService.method.createFunctionVersion, {
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: createGetFunctionQueryKey(undefined, transport),
      });
      void queryClient.invalidateQueries({
        queryKey: createListFunctionsQueryKey(undefined, transport),
      });
      return options.onSettled?.(...args);
    },
  });
};

export const createGetFunctionVersionInput = (
  functionId: AlchemyFunction["id"],
  version: FunctionVersion["version"],
) => create(GetFunctionVersionRequestSchema, { functionId, version });

export const useGetFunctionVersionQuery = ({
  input,
  options = {},
}: {
  input: GetFunctionVersionRequest;
  options?: UseQueryOptions<
    typeof FunctionsService.method.getFunctionVersion.output,
    GetFunctionVersionResponse
  >;
}) => {
  return useQuery(FunctionsService.method.getFunctionVersion, input, options);
};
