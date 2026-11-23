import { type UseQueryOptions, useQuery } from "@connectrpc/connect-query";

import { FunctionsService } from "@/gen/functions/v1/service_pb";
import type { GetVersionResponse } from "@/gen/functions/v1/version_pb";

export const useGetVersionQuery = ({
  options = {},
}: {
  options?: UseQueryOptions<typeof FunctionsService.method.getVersion.output, GetVersionResponse>;
} = {}) => {
  return useQuery(
    FunctionsService.method.getVersion,
    {},
    {
      staleTime: Number.POSITIVE_INFINITY,
      ...options,
    },
  );
};
