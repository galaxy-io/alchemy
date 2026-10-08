import type { JsonObject } from "@bufbuild/protobuf";

import CodeEditor, { CodeEditorLanguage } from "@galaxy-io/dls/editor/CodeEditor";

import FunctionCodeEditorFrame from "@/pages/functions/components/FunctionCodeEditorFrame";

import { formatJson } from "@/utils/json";

interface FunctionContractSchemaProps {
  value: JsonObject | undefined;
}

const FunctionContractSchema = ({ value }: FunctionContractSchemaProps) => (
  <FunctionCodeEditorFrame>
    <CodeEditor
      ariaLabel="Schema"
      language={CodeEditorLanguage.JSON}
      value={formatJson(value ?? {})}
      isReadOnly
      isGhost
      hasLineNumbers
    />
  </FunctionCodeEditorFrame>
);

export default FunctionContractSchema;
