import { create } from "@bufbuild/protobuf";

import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";

import { FunctionVersionStatus, GetFunctionRequestSchema } from "@/gen/functions/v1/functions_pb";

import FunctionWorkbenchPlayground from "@/pages/functions/workbench/FunctionWorkbenchPlayground";
import { getFunctionWorkbenchVersion } from "@/pages/functions/workbench/utils";

import { useSuspenseGetFunctionQuery } from "@/api/queries/functions";

import { useFunctionParams, useFunctionSearch } from "@/module/hooks";

const FunctionWorkbenchPage = () => {
  const { id } = useFunctionParams();
  const { version: requestedVersion } = useFunctionSearch();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const version = getFunctionWorkbenchVersion(data.function?.versions ?? [], requestedVersion);
  const runVersion = version?.status === FunctionVersionStatus.READY ? version.version : undefined;

  return (
    <Box variant={BoxVariant.BASE} height="100%" overflow="hidden">
      <FunctionWorkbenchPlayground
        key={`${id}-${version?.version ?? ""}`}
        functionId={id}
        version={runVersion}
        contract={version?.spec?.contract}
      />
    </Box>
  );
};

export default FunctionWorkbenchPage;
