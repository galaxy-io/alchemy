import { create } from "@bufbuild/protobuf";
import { useSuspenseQuery } from "@connectrpc/connect-query";

import { GetHostRequestSchema } from "@/gen/functions/v1/host_pb";
import { FunctionsService } from "@/gen/functions/v1/service_pb";

import { HOSTS_REFETCH_INTERVAL } from "@/api/queries/constants";

const GET_HOST_INPUT = create(GetHostRequestSchema);

export const useSuspenseGetHostQuery = () => {
  return useSuspenseQuery(FunctionsService.method.getHost, GET_HOST_INPUT, {
    refetchInterval: HOSTS_REFETCH_INTERVAL,
  });
};
