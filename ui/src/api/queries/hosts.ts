import { useQuery } from "@connectrpc/connect-query";

import { FunctionsService } from "@/gen/functions/v1/service_pb";

const LIST_HOSTS_REFETCH_INTERVAL = 2 * 1000;

// Not suspense: the page still lists instances before any host has sent a heartbeat.
export const useListHostsQuery = () => {
  return useQuery(
    FunctionsService.method.listHosts,
    {},
    { refetchInterval: LIST_HOSTS_REFETCH_INTERVAL },
  );
};
