import type { FC } from "react";

import Box from "@galaxy-io/dls/layout/Box";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import type { TreeItem } from "@galaxy-io/dls/tree/Tree";
import Tree from "@galaxy-io/dls/tree/Tree";

import { FUNCTION_WORKBENCH_TREE_EXPANDED_IDS } from "@/pages/functions/workbench/constants";
import {
  getFunctionWorkbenchSourcePath,
  isFunctionWorkbenchFile,
} from "@/pages/functions/workbench/utils";

interface FunctionWorkbenchFilesProps {
  items: TreeItem[];
  file: string;
  onChange: (file: string) => void;
}

const FunctionWorkbenchFiles: FC<FunctionWorkbenchFilesProps> = ({ items, file, onChange }) => (
  <ScrollArea>
    <Box padding={8}>
      <Tree
        ariaLabel="Files"
        items={items}
        value={file}
        defaultExpandedIds={FUNCTION_WORKBENCH_TREE_EXPANDED_IDS}
        onChange={(id) => {
          const path = getFunctionWorkbenchSourcePath(id);
          if (isFunctionWorkbenchFile(id) || (path && !path.endsWith("/"))) onChange(id);
        }}
      />
    </Box>
  </ScrollArea>
);

export default FunctionWorkbenchFiles;
