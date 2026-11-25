import type { Function as AlchemyFunction, Runtime } from "@/gen/functions/v1/functions_pb";

import { getFunctionCurrentVersion, getFunctionVersionRuntime } from "@/pages/functions/utils";

import { useListRuntimesQuery } from "@/api/queries/runtimes";

/**
 * Resolve the coding-language (runtime) for a function, fetching the runtimes
 * list on demand. Pass an existing `runtimes` array (e.g. from a query the
 * caller already has) to skip the internal fetch.
 */
export const useFunctionRuntime = (
  alchemyFunction: AlchemyFunction | undefined,
  runtimes?: Runtime[],
): Runtime | undefined => {
  const { data } = useListRuntimesQuery({ options: { enabled: runtimes === undefined } });
  const resolved = runtimes ?? data?.runtimes ?? [];
  return alchemyFunction
    ? getFunctionVersionRuntime(resolved, getFunctionCurrentVersion(alchemyFunction))
    : undefined;
};
