import { FunctionPageTab } from "@/pages/functions/components/header/types";

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

// Relative to the module base; `RouterLink` and `useAlchemyMatchRoute` resolve them.
export const FUNCTION_PAGE_TAB_TO_ROUTE_MAP: Record<FunctionPageTab, string> = {
  [FunctionPageTab.OVERVIEW]: "./images/$id",
  [FunctionPageTab.WORKBENCH]: "./images/$id/workbench",
  [FunctionPageTab.CONTRACT]: "./images/$id/contract",
  [FunctionPageTab.VERSIONS]: "./images/$id/versions",
  [FunctionPageTab.INVOCATIONS]: "./images/$id/invocations",
  [FunctionPageTab.SETTINGS]: "./images/$id/settings",
};
