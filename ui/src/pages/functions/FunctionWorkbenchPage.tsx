import type { FC } from "react";

import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";

import { useFunctionVersion } from "@/pages/functions/hooks/useFunctionVersion";
import FunctionWorkbench from "@/pages/functions/workbench/FunctionWorkbench";

import { useFunctionParams } from "@/module/hooks";

const FunctionWorkbenchPage: FC = () => {
  const { id } = useFunctionParams();
  const version = useFunctionVersion();

  return (
    <Box variant={BoxVariant.BASE} height="100%" overflow="hidden">
      <FunctionWorkbench
        key={`${id}:${version?.version ?? ""}`}
        functionId={id}
        version={version}
      />
    </Box>
  );
};

export default FunctionWorkbenchPage;
