import type { FC } from "react";

import { FileCodeIcon } from "@phosphor-icons/react";

import EmptyLayout from "@galaxy-io/dls/layout/EmptyLayout";

import FunctionContractCanvas from "@/pages/functions/components/contract/FunctionContractCanvas";
import FunctionContractSignature from "@/pages/functions/contract/FunctionContractSignature";
import { useFunctionVersion } from "@/pages/functions/hooks/useFunctionVersion";
import { FunctionContractSide } from "@/pages/functions/types";

const FunctionContractPage: FC = () => {
  const contract = useFunctionVersion()?.spec?.contract?.kind;

  if (!contract?.case) {
    return (
      <EmptyLayout
        icon={FileCodeIcon}
        header="No contract"
        description="This version has no input or output contract"
      />
    );
  }

  return (
    <FunctionContractCanvas
      input={
        <FunctionContractSignature
          label="Input"
          side={FunctionContractSide.INPUT}
          contract={contract}
        />
      }
      output={
        <FunctionContractSignature
          label="Output"
          side={FunctionContractSide.OUTPUT}
          contract={contract}
        />
      }
    />
  );
};

export default FunctionContractPage;
