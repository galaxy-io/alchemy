import Tabs, { type TabLinkItem } from "@galaxy-io/dls/navigation/Tabs";

import RouterLink from "@/components/RouterLink";

import {
  FUNCTION_PAGE_TAB_TO_LABEL_MAP,
  FUNCTION_PAGE_TAB_TO_ROUTE_MAP,
  FUNCTION_PAGE_TABS,
  FUNCTION_PAGE_TABS_INSET,
} from "@/pages/functions/components/header/constants";
import { FunctionPageTab } from "@/pages/functions/components/header/types";

import { useAlchemyMatchRoute, useFunctionParams } from "@/module/hooks";

const FunctionPageTabs = () => {
  const { id } = useFunctionParams();
  const matchRoute = useAlchemyMatchRoute();

  const items: TabLinkItem<FunctionPageTab>[] = FUNCTION_PAGE_TABS.map((tab) => ({
    id: tab,
    label: FUNCTION_PAGE_TAB_TO_LABEL_MAP[tab],
    href: FUNCTION_PAGE_TAB_TO_ROUTE_MAP[tab].replace("$id", id),
  }));

  const activeTab =
    FUNCTION_PAGE_TABS.find((tab) => matchRoute(FUNCTION_PAGE_TAB_TO_ROUTE_MAP[tab], { id })) ??
    FunctionPageTab.OVERVIEW;

  return (
    <Tabs
      ariaLabel="Function"
      as={RouterLink}
      items={items}
      value={activeTab}
      inset={FUNCTION_PAGE_TABS_INSET}
    />
  );
};

export default FunctionPageTabs;
