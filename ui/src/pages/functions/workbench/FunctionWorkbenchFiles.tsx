import type { FC } from "react";

import Box from "@galaxy-io/dls/layout/Box";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import type { TreeItem } from "@galaxy-io/dls/tree/Tree";
import Tree from "@galaxy-io/dls/tree/Tree";

import { FUNCTION_WORKBENCH_TREE_EXPANDED_IDS } from "@/pages/functions/workbench/constants";
import {
  isFunctionWorkbenchFile,
  isFunctionWorkbenchSourceFile,
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
          if (isFunctionWorkbenchFile(id) || isFunctionWorkbenchSourceFile(id)) onChange(id);
        }}
      />
    </Box>
  </ScrollArea>
);

export default FunctionWorkbenchFiles;
