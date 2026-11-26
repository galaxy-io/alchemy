import type { FunctionVersion } from "@/gen/functions/v1/functions_pb";

import { getFunctionCurrentVersion } from "@/components/functions/utils";

import { useFunctionParams, useFunctionSearch } from "@/module/hooks";

import { createGetFunctionInput, useSuspenseGetFunctionQuery } from "@/api/queries/functions";

export const useFunctionVersion = (): FunctionVersion | undefined => {
  const { id } = useFunctionParams();
  const { version } = useFunctionSearch();

  const { data } = useSuspenseGetFunctionQuery({ input: createGetFunctionInput(id) });
  const alchemyFunction = data.function;

  return (
    alchemyFunction?.versions.find((candidate) => candidate.version === version) ??
    (alchemyFunction && getFunctionCurrentVersion(alchemyFunction)) ??
    alchemyFunction?.versions[0]
  );
};
