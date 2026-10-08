import { useQuery } from "@connectrpc/connect-query";

import type { GetHostRequest } from "@/gen/functions/v1/host_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

// Not suspense: GetHost is UNAVAILABLE until a host has sent a heartbeat, and the page still lists
// instances without one.
export const useGetHostQuery = ({ input }: { input?: GetHostRequest } = {}) => {
  return useQuery<
    typeof FunctionsService.method.getHost.input,
    typeof FunctionsService.method.getHost.output
  >(FunctionsService.method.getHost, input);
};
