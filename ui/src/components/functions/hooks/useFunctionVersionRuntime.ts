import type { FunctionVersion, Runtime } from "@/gen/functions/v1/functions_pb";

import { getFunctionVersionRuntime } from "@/components/functions/utils";

import { useListRuntimesQuery } from "@/api/queries/runtimes";

export const useFunctionVersionRuntime = (
  version: FunctionVersion | undefined,
): Runtime | undefined => {
  const { data } = useListRuntimesQuery();
  return getFunctionVersionRuntime(data?.runtimes ?? [], version);
};
