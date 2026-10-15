import type { FC } from "react";

import CodeEditor, { CodeEditorLanguage } from "@galaxy-io/dls/editor/CodeEditor";

import FunctionContractIsland from "@/pages/functions/components/contract/FunctionContractIsland";
import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import { CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP } from "@/pages/functions/components/create/constants";
import FunctionCodeEditorFrame from "@/pages/functions/components/FunctionCodeEditorFrame";
import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import type { FunctionContractSide } from "@/pages/functions/types";

interface CreateFunctionModalContractSchemaEditorProps {
  side: FunctionContractSide;
}

const CreateFunctionModalContractSchemaEditor: FC<CreateFunctionModalContractSchemaEditorProps> = ({
  side,
}) => {
  const { schemaTexts, schemaErrors } = useCreateFunctionModalState();
  const { setSchemaText } = useCreateFunctionModalActions();
  const label = CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP[side];
  const error = schemaErrors[side];

  return (
    <FunctionContractIsland
      label={label}
      caption={FUNCTION_CONTRACT_KIND_TO_LABEL_MAP.jsonSchema}
      error={error}
    >
      <FunctionCodeEditorFrame>
        <CodeEditor
          ariaLabel={`${label} schema`}
          language={CodeEditorLanguage.JSON}
          value={schemaTexts[side]}
          onChange={(text) => setSchemaText(side, text)}
          isGhost
          hasLineNumbers
          isError={!!error}
        />
      </FunctionCodeEditorFrame>
    </FunctionContractIsland>
  );
};

export default CreateFunctionModalContractSchemaEditor;
