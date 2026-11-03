import type { FC } from "react";

import CodeEditor from "@galaxy-io/dls/editor/CodeEditor";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Tabs, { type TabItem, TabsSize, TabsVariant } from "@galaxy-io/dls/navigation/Tabs";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import FunctionCodeEditorFrame from "@/pages/functions/components/FunctionCodeEditorFrame";
import FunctionSourceFileIcon from "@/pages/functions/components/FunctionSourceFileIcon";
import { getFunctionSourceExtensions, getFunctionSourceLanguage } from "@/pages/functions/utils";

const CreateFunctionModalCode: FC = () => {
  const { sourceFiles, sourceFile, runtimes } = useCreateFunctionModalState();
  const { setSourceFile, setSourceFileContent } = useCreateFunctionModalActions();
  const file = sourceFiles.find((candidate) => candidate.path === sourceFile) ?? sourceFiles[0];
  const items: TabItem[] = sourceFiles.map(({ path }) => ({
    id: path,
    label: path,
    leading: <FunctionSourceFileIcon path={path} runtimes={runtimes} />,
  }));

  if (!file) return null;

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
      <Flex padding={[8, 12]} shrink={0}>
        <Tabs
          ariaLabel="Files"
          items={items}
          value={file.path}
          onChange={setSourceFile}
          variant={TabsVariant.PILL}
          size={TabsSize.SMALL}
        />
      </Flex>
      <Divider />
      <FunctionCodeEditorFrame>
        <CodeEditor
          key={file.path}
          ariaLabel={file.path}
          language={getFunctionSourceLanguage(file.path)}
          extensions={getFunctionSourceExtensions(file.path)}
          value={file.content}
          onChange={(content) => setSourceFileContent({ path: file.path, content })}
          isGhost
          hasLineNumbers
        />
      </FunctionCodeEditorFrame>
    </Flex>
  );
};

export default CreateFunctionModalCode;
