import { type UseMutationOptions, useMutation, useTransport } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

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
