import CodeEditor, { CodeEditorLanguage } from "@galaxy-io/dls/editor/CodeEditor";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";

import FunctionCodeEditorFrame from "@/pages/functions/components/FunctionCodeEditorFrame";

interface FunctionWorkbenchPlaygroundInputProps {
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  onExecute: () => void;
}

const FunctionWorkbenchPlaygroundInput = ({
  value,
  error,
  onChange,
  onExecute,
}: FunctionWorkbenchPlaygroundInputProps) => (
  <Flex direction={FlexDirection.COLUMN} height="100%" minHeight={0}>
    <FunctionCodeEditorFrame>
      <CodeEditor
        ariaLabel="Input"
        language={CodeEditorLanguage.JSON}
        value={value}
        onChange={onChange}
        onExecute={onExecute}
        isGhost
        hasLineNumbers
        isError={error !== undefined}
      />
    </FunctionCodeEditorFrame>
    {error && (
      <Flex padding={[4, 12]} shrink={0}>
        <Text size={TextSize.CAPTION} variant={TextVariant.ERROR}>
          {error}
        </Text>
      </Flex>
    )}
  </Flex>
);

export default FunctionWorkbenchPlaygroundInput;
