import { create } from "@bufbuild/protobuf";
import { type UseQueryOptions, useQuery } from "@connectrpc/connect-query";

import {
  type ListRuntimesRequest,
  ListRuntimesRequestSchema,
  type ListRuntimesResponse,
} from "@/gen/functions/v1/functions_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

export const createListRuntimesInput = () => create(ListRuntimesRequestSchema, {});

export const useListRuntimesQuery = ({
  input = createListRuntimesInput(),
  options = {},
}: {
  input?: ListRuntimesRequest;
  options?: UseQueryOptions<
    typeof FunctionsService.method.listRuntimes.output,
    ListRuntimesResponse
  >;
} = {}) => {
  return useQuery(FunctionsService.method.listRuntimes, input, options);
};
