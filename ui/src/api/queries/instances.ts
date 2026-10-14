import { create } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { createConnectQueryKey, useSuspenseQuery } from "@connectrpc/connect-query";

import { type ListInstancesRequest, ListInstancesRequestSchema } from "@/gen/functions/v1/host_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

import { HOSTS_REFETCH_INTERVAL } from "@/api/queries/constants";

const LIST_INSTANCES_INPUT = create(ListInstancesRequestSchema);

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

export const useSuspenseListInstancesQuery = () => {
  return useSuspenseQuery(FunctionsService.method.listInstances, LIST_INSTANCES_INPUT, {
    refetchInterval: HOSTS_REFETCH_INTERVAL,
  });
};
