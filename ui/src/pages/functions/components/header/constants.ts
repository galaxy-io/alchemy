import { FunctionPageTab } from "@/pages/functions/components/header/types";

import { AlchemyPath } from "@/module/paths";

export const FUNCTION_PAGE_VERSION_SELECT_WIDTH = 120;
export const FUNCTION_PAGE_TABS_INSET = 16;

export const FUNCTION_PAGE_TABS: FunctionPageTab[] = [
  FunctionPageTab.OVERVIEW,
  FunctionPageTab.WORKBENCH,
  FunctionPageTab.CONTRACT,
  FunctionPageTab.VERSIONS,
  FunctionPageTab.INVOCATIONS,
  FunctionPageTab.SETTINGS,
];

export const FUNCTION_PAGE_TAB_TO_LABEL_MAP: Record<FunctionPageTab, string> = {
  [FunctionPageTab.OVERVIEW]: "Overview",
  [FunctionPageTab.WORKBENCH]: "Workbench",
  [FunctionPageTab.CONTRACT]: "Contract",
  [FunctionPageTab.VERSIONS]: "Versions",
  [FunctionPageTab.INVOCATIONS]: "Invocations",
  [FunctionPageTab.SETTINGS]: "Settings",
};

export const FUNCTION_PAGE_TAB_TO_PATH_MAP: Record<FunctionPageTab, AlchemyPath> = {
  [FunctionPageTab.OVERVIEW]: AlchemyPath.FUNCTION,
  [FunctionPageTab.WORKBENCH]: AlchemyPath.FUNCTION_WORKBENCH,
  [FunctionPageTab.CONTRACT]: AlchemyPath.FUNCTION_CONTRACT,
  [FunctionPageTab.VERSIONS]: AlchemyPath.FUNCTION_VERSIONS,
  [FunctionPageTab.INVOCATIONS]: AlchemyPath.FUNCTION_INVOCATIONS,
  [FunctionPageTab.SETTINGS]: AlchemyPath.FUNCTION_SETTINGS,
};
