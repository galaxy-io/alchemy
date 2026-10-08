import { styled } from "@linaria/react";

import SidebarNav, { NavItem } from "@galaxy-io/dls/navigation/SidebarNav";

import RouterLink from "@/components/RouterLink";

import { MAIN_LAYOUT_SIDEBAR_WIDTH } from "@/layouts/main/constants";
import MainLayoutSidebarFooter from "@/layouts/main/MainLayoutSidebarFooter";

import { useAlchemyMatchRoute } from "@/module/hooks";
import {
  ALCHEMY_NAV_ITEM_TO_ICON_MAP,
  ALCHEMY_NAV_ITEM_TO_LABEL_MAP,
  ALCHEMY_NAV_ITEM_TO_PATH_MAP,
  ALCHEMY_NAV_ITEMS,
  AlchemyNavItem,
} from "@/module/nav";

// SidebarNav draws a hairline above its footer; the island's frame already separates it.
const SidebarWrapper = styled.div<{ $width: number }>`
  width: ${({ $width }) => $width}px;
  height: 100%;

  & [class*="gx-SidebarNav-Footer"] {
    border-top: 0;
  }
`;

const MainLayoutSidebar = () => {
  const matchRoute = useAlchemyMatchRoute();

  const activeItem =
    ALCHEMY_NAV_ITEMS.find((item) =>
      matchRoute(ALCHEMY_NAV_ITEM_TO_PATH_MAP[item], undefined, true),
    ) ?? AlchemyNavItem.OBSERVABILITY;

  return (
    <SidebarWrapper $width={MAIN_LAYOUT_SIDEBAR_WIDTH}>
      <SidebarNav ariaLabel="Main" footer={<MainLayoutSidebarFooter />}>
        {ALCHEMY_NAV_ITEMS.map((item) => (
          <NavItem
            key={item}
            label={ALCHEMY_NAV_ITEM_TO_LABEL_MAP[item]}
            icon={ALCHEMY_NAV_ITEM_TO_ICON_MAP[item]}
            href={ALCHEMY_NAV_ITEM_TO_PATH_MAP[item]}
            as={RouterLink}
            isActive={activeItem === item}
          />
        ))}
      </SidebarNav>
    </SidebarWrapper>
  );
};

export default MainLayoutSidebar;
