import type { JsonValue } from "@bufbuild/protobuf";
import { FileIcon, FolderIcon } from "@phosphor-icons/react";

import type { TreeItem } from "@galaxy-io/dls/tree/Tree";

import { FunctionWorkbenchFile } from "@/pages/functions/workbench/types";

export const FUNCTION_WORKBENCH_STORAGE_KEY = "alchemy:workbench";
export const FUNCTION_WORKBENCH_RESULT_STORAGE_KEY = "alchemy:workbench-result";

export const FUNCTION_WORKBENCH_FILES_DEFAULT_WIDTH = 200;
export const FUNCTION_WORKBENCH_FILES_MIN_WIDTH = 140;
export const FUNCTION_WORKBENCH_FILES_MAX_WIDTH = 320;

export const FUNCTION_WORKBENCH_RESULT_DEFAULT_WIDTH = 450;
export const FUNCTION_WORKBENCH_RESULT_MIN_WIDTH = 450;
export const FUNCTION_WORKBENCH_RESULT_MAX_WIDTH = 640;

export const FUNCTION_WORKBENCH_DEFAULT_INPUT: JsonValue = {};

export const FUNCTION_WORKBENCH_DEFAULT_FILE: string = FunctionWorkbenchFile.INPUT;

export const FUNCTION_WORKBENCH_SOURCE_PREFIX = "source:";

export const FUNCTION_WORKBENCH_READ_ONLY_LABEL = "Read-only";

export const FUNCTION_WORKBENCH_FILES = Object.values(FunctionWorkbenchFile);

export const FUNCTION_WORKBENCH_FILE_TO_PATH_MAP: Record<FunctionWorkbenchFile, string> = {
  [FunctionWorkbenchFile.INPUT]: "input.json",
  [FunctionWorkbenchFile.CONTRACT_INPUT]: "contract/input.json",
  [FunctionWorkbenchFile.CONTRACT_OUTPUT]: "contract/output.json",
  [FunctionWorkbenchFile.SPEC]: "spec.json",
};

const FUNCTION_WORKBENCH_CONTRACT_FOLDER_ID = "contract";

export const FUNCTION_WORKBENCH_TREE_EXPANDED_IDS = [FUNCTION_WORKBENCH_CONTRACT_FOLDER_ID];

export const FUNCTION_WORKBENCH_TREE_ITEMS: TreeItem[] = [
  { id: FunctionWorkbenchFile.INPUT, label: "input.json", icon: FileIcon },
  {
    id: FUNCTION_WORKBENCH_CONTRACT_FOLDER_ID,
    label: "contract",
    icon: FolderIcon,
    children: [
      { id: FunctionWorkbenchFile.CONTRACT_INPUT, label: "input.json", icon: FileIcon },
      { id: FunctionWorkbenchFile.CONTRACT_OUTPUT, label: "output.json", icon: FileIcon },
    ],
  },
  { id: FunctionWorkbenchFile.SPEC, label: "spec.json", icon: FileIcon },
];
