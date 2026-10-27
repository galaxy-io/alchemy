import { create } from "@bufbuild/protobuf";
import { useSuspenseQuery } from "@connectrpc/connect-query";

import { ListHostsRequestSchema } from "@/gen/functions/v1/host_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

import { HOSTS_REFETCH_INTERVAL } from "@/api/queries/constants";

const LIST_HOSTS_INPUT = create(ListHostsRequestSchema);

export const useSuspenseListHostsQuery = () => {
  return useSuspenseQuery(FunctionsService.method.listHosts, LIST_HOSTS_INPUT, {
    refetchInterval: HOSTS_REFETCH_INTERVAL,
  });
};
