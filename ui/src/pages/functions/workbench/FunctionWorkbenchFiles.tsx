import type { FC } from "react";

import Box from "@galaxy-io/dls/layout/Box";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import Tree from "@galaxy-io/dls/tree/Tree";

import {
  FUNCTION_WORKBENCH_TREE_EXPANDED_IDS,
  FUNCTION_WORKBENCH_TREE_ITEMS,
} from "@/pages/functions/workbench/constants";
import type { FunctionWorkbenchFile } from "@/pages/functions/workbench/types";
import { isFunctionWorkbenchFile } from "@/pages/functions/workbench/utils";

interface FunctionWorkbenchFilesProps {
  file: FunctionWorkbenchFile;
  onChange: (file: FunctionWorkbenchFile) => void;
}

const FunctionWorkbenchFiles: FC<FunctionWorkbenchFilesProps> = ({ file, onChange }) => (
  <ScrollArea>
    <Box padding={8}>
      <Tree
        ariaLabel="Files"
        items={FUNCTION_WORKBENCH_TREE_ITEMS}
        value={file}
        defaultExpandedIds={FUNCTION_WORKBENCH_TREE_EXPANDED_IDS}
        onChange={(id) => {
          if (isFunctionWorkbenchFile(id)) onChange(id);
        }}
      />
    </Box>
  </ScrollArea>
);

export default FunctionWorkbenchFiles;
