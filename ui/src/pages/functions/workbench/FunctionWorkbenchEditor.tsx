import type { FC } from "react";

import CodeEditor, { CodeEditorLanguage } from "@galaxy-io/dls/editor/CodeEditor";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";

import type { FunctionVersion } from "@/gen/functions/v1/functions_pb";

import FunctionCodeEditorFrame from "@/pages/functions/components/FunctionCodeEditorFrame";
import { getFunctionSourceLanguage } from "@/pages/functions/utils";
import { FUNCTION_WORKBENCH_FILE_TO_PATH_MAP } from "@/pages/functions/workbench/constants";
import { FunctionWorkbenchFile } from "@/pages/functions/workbench/types";
import {
  formatFunctionWorkbenchReadOnlyFile,
  getFunctionWorkbenchSourcePath,
  isFunctionWorkbenchFile,
} from "@/pages/functions/workbench/utils";

interface FunctionWorkbenchEditorProps {
  file: string;
  version: FunctionVersion | undefined;
  input: string;
  inputError: string | undefined;
  source: string | undefined;
  onInputChange: (value: string) => void;
  onSourceChange: (path: string, value: string) => void;
  onRun: () => void;
}

const FunctionWorkbenchEditor: FC<FunctionWorkbenchEditorProps> = ({
  file,
  version,
  input,
  inputError,
  source,
  onInputChange,
  onSourceChange,
  onRun,
}) => {
  const path = getFunctionWorkbenchSourcePath(file);
  if (path !== undefined) {
    return (
      <Flex direction={FlexDirection.COLUMN} height="100%" minWidth={0}>
        <FunctionCodeEditorFrame>
          <CodeEditor
            key={file}
            ariaLabel={path}
            language={getFunctionSourceLanguage(path)}
            value={source ?? ""}
            onChange={(value) => onSourceChange(path, value)}
            isReadOnly={source === undefined}
            isGhost
            hasLineNumbers
          />
        </FunctionCodeEditorFrame>
      </Flex>
    );
  }

  if (!isFunctionWorkbenchFile(file)) return null;

  if (file !== FunctionWorkbenchFile.INPUT) {
    return (
      <Flex direction={FlexDirection.COLUMN} height="100%" minWidth={0}>
        <FunctionCodeEditorFrame>
          <CodeEditor
            key={file}
            ariaLabel={FUNCTION_WORKBENCH_FILE_TO_PATH_MAP[file]}
            language={CodeEditorLanguage.JSON}
            value={formatFunctionWorkbenchReadOnlyFile(file, version)}
            isReadOnly
            isGhost
            hasLineNumbers
          />
        </FunctionCodeEditorFrame>
      </Flex>
    );
  }

  return (
    <Flex direction={FlexDirection.COLUMN} height="100%" minWidth={0}>
      <FunctionCodeEditorFrame>
        <CodeEditor
          ariaLabel={FUNCTION_WORKBENCH_FILE_TO_PATH_MAP[file]}
          language={CodeEditorLanguage.JSON}
          value={input}
          onChange={onInputChange}
          onExecute={onRun}
          isError={!!inputError}
          isGhost
          hasLineNumbers
        />
      </FunctionCodeEditorFrame>
      {inputError && (
        <Flex padding={[4, 12]} shrink={0}>
          <Text size={TextSize.CAPTION} variant={TextVariant.ERROR}>
            {inputError}
          </Text>
        </Flex>
      )}
    </Flex>
  );
};

export default FunctionWorkbenchEditor;
