import type { FC } from "react";

import Tabs, { type TabLinkItem } from "@galaxy-io/dls/navigation/Tabs";

import RouterLink from "@/components/RouterLink";

import {
  FUNCTION_PAGE_TAB_TO_LABEL_MAP,
  FUNCTION_PAGE_TAB_TO_PATH_MAP,
  FUNCTION_PAGE_TABS,
  FUNCTION_PAGE_TABS_INSET,
} from "@/pages/functions/components/header/constants";
import { FunctionPageTab } from "@/pages/functions/components/header/types";

import { useAlchemyMatchRoute, useFunctionParams } from "@/module/hooks";
import { createAlchemyHref } from "@/module/paths";

const FunctionPageTabs: FC = () => {
  const { id } = useFunctionParams();
  const matchRoute = useAlchemyMatchRoute();

  const items: TabLinkItem<FunctionPageTab>[] = FUNCTION_PAGE_TABS.map((tab) => ({
    id: tab,
    label: FUNCTION_PAGE_TAB_TO_LABEL_MAP[tab],
    href: createAlchemyHref(FUNCTION_PAGE_TAB_TO_PATH_MAP[tab], { id }),
  }));

  const activeTab =
    FUNCTION_PAGE_TABS.find((tab) =>
      matchRoute(FUNCTION_PAGE_TAB_TO_PATH_MAP[tab], { params: { id } }),
    ) ?? FunctionPageTab.OVERVIEW;

  return (
    <Tabs
      ariaLabel="Image"
      as={RouterLink}
      items={items}
      value={activeTab}
      inset={FUNCTION_PAGE_TABS_INSET}
    />
  );
};

export default FunctionPageTabs;
