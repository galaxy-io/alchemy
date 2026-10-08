import type { Transport } from "@connectrpc/connect";
import { createConnectQueryKey, useSuspenseQuery } from "@connectrpc/connect-query";

import type { ListInstancesRequest } from "@/gen/functions/v1/host_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

export const createListInstancesQueryKey = (
  input?: ListInstancesRequest,
  transport?: Transport,
) => {
  return createConnectQueryKey({
    schema: FunctionsService.method.listInstances,
    input,
    transport,
    cardinality: "finite",
  });
};

export const useSuspenseListInstancesQuery = ({ input }: { input?: ListInstancesRequest } = {}) => {
  return useSuspenseQuery<
    typeof FunctionsService.method.listInstances.input,
    typeof FunctionsService.method.listInstances.output
  >(FunctionsService.method.listInstances, input);
};
