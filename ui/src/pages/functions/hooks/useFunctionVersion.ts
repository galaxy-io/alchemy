import { create } from "@bufbuild/protobuf";

import { type FunctionVersion, GetFunctionRequestSchema } from "@/gen/functions/v1/functions_pb";

import { getFunctionCurrentVersion } from "@/pages/functions/utils";

import { useSuspenseGetFunctionQuery } from "@/api/queries/functions";

import { useFunctionParams, useFunctionSearch } from "@/module/hooks";

export const useFunctionVersion = (): FunctionVersion | undefined => {
  const { id } = useFunctionParams();
  const { version } = useFunctionSearch();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const fn = data.function;

  return (
    fn?.versions.find((candidate) => candidate.version === version) ??
    (fn && getFunctionCurrentVersion(fn)) ??
    fn?.versions[0]
  );
};
