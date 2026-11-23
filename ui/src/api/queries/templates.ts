import { create } from "@bufbuild/protobuf";
import { type UseQueryOptions, useQuery } from "@connectrpc/connect-query";

import { FunctionsService } from "@/gen/functions/v1/service_pb";
import {
  type ListTemplatesRequest,
  ListTemplatesRequestSchema,
  type ListTemplatesResponse,
} from "@/gen/functions/v1/templates_pb";

export const createListTemplatesInput = () => create(ListTemplatesRequestSchema, {});

export const useListTemplatesQuery = ({
  input = createListTemplatesInput(),
  options = {},
}: {
  input?: ListTemplatesRequest;
  options?: UseQueryOptions<
    typeof FunctionsService.method.listTemplates.output,
    ListTemplatesResponse
  >;
} = {}) => {
  return useQuery(FunctionsService.method.listTemplates, input, options);
};
