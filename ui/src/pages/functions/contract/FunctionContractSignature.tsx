import type { FC } from "react";

import { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import CopyButton from "@galaxy-io/dls/buttons/CopyButton";
import CodeEditor, { CodeEditorLanguage } from "@galaxy-io/dls/editor/CodeEditor";

import type { Contract } from "@/gen/functions/v1/common_pb";

import FunctionContractIsland from "@/pages/functions/components/contract/FunctionContractIsland";
import FunctionCodeEditorFrame from "@/pages/functions/components/FunctionCodeEditorFrame";
import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import {
  createContractSideJson,
  createContractSideSignature,
} from "@/pages/functions/contract/utils";
import type { FunctionContractKind, FunctionContractSide } from "@/pages/functions/types";

import { formatJson } from "@/utils/json";

interface FunctionContractSignatureProps {
  label: string;
  side: FunctionContractSide;
  contract: Contract["kind"] & { case: FunctionContractKind };
}

const FunctionContractSignature: FC<FunctionContractSignatureProps> = ({
  label,
  side,
  contract,
}) => {
  const signature = createContractSideSignature(contract, side);
  const schema = formatJson(createContractSideJson(contract, side));
  const kindLabel = FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[contract.case];

  return (
    <FunctionContractIsland
      label={label}
      caption={kindLabel}
      actions={
        <CopyButton
          value={schema}
          ariaLabel={`Copy ${label.toLowerCase()} ${kindLabel} schema`}
          variant={ButtonVariant.TERTIARY}
          size={ButtonSize.SMALL}
        />
      }
    >
      <FunctionCodeEditorFrame>
        <CodeEditor
          ariaLabel={`${label} signature`}
          language={CodeEditorLanguage.TYPESCRIPT}
          value={signature}
          isReadOnly
          isGhost
        />
      </FunctionCodeEditorFrame>
    </FunctionContractIsland>
  );
};

export default FunctionContractSignature;
