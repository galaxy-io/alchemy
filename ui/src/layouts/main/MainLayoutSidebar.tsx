import type { FC, ReactNode } from "react";

import PoweredBy, { PoweredByWordmark } from "@galaxy-io/dls/brand/PoweredBy";
import { AppFrameToggle } from "@galaxy-io/dls/layout/AppFrame";
import Flex, { AlignItems, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import SidebarNav, { NavItem } from "@galaxy-io/dls/navigation/SidebarNav";
import { t } from "@galaxy-io/dls/theme/tokens/t";

import RouterLink from "@/components/RouterLink";

import { useAlchemyMatchRoute } from "@/module/hooks";
import {
  ALCHEMY_NAV_ITEM_TO_ICON_MAP,
  ALCHEMY_NAV_ITEM_TO_LABEL_MAP,
  ALCHEMY_NAV_ITEM_TO_PATH_MAP,
  ALCHEMY_NAV_ITEMS,
} from "@/module/nav";
import { createAlchemyHref } from "@/module/paths";

import { useGetVersionQuery } from "@/api/queries/version";

import { GITHUB_REPO_URL } from "@/constants";

import { formatServerVersion } from "@/utils/format";

interface MainLayoutSidebarProps {
  footer?: ReactNode;
}

const MainLayoutSidebar: FC<MainLayoutSidebarProps> = ({ footer }) => {
  const matchRoute = useAlchemyMatchRoute();
  const { data: versionData } = useGetVersionQuery();

  const version = versionData?.version ? formatServerVersion(versionData.version) : undefined;

  const activeItem = ALCHEMY_NAV_ITEMS.find((item) =>
    matchRoute(ALCHEMY_NAV_ITEM_TO_PATH_MAP[item], { fuzzy: true }),
  );

  return (
    <SidebarNav
      ariaLabel="Alchemy"
      hasDividers={false}
      footer={
        <>
          {footer}
          <Flex
            alignItems={AlignItems.CENTER}
            justifyContent={JustifyContent.SPACE_BETWEEN}
            height={t.size.control.xLarge}
          >
            <PoweredBy
              label={null}
              wordmark={PoweredByWordmark.ALCHEMY}
              href={GITHUB_REPO_URL}
              ariaLabel="Alchemy on GitHub"
              trailing={version}
            />
            <AppFrameToggle />
          </Flex>
        </>
      }
    >
      {ALCHEMY_NAV_ITEMS.map((item) => (
        <NavItem
          key={item}
          label={ALCHEMY_NAV_ITEM_TO_LABEL_MAP[item]}
          icon={ALCHEMY_NAV_ITEM_TO_ICON_MAP[item]}
          href={createAlchemyHref(ALCHEMY_NAV_ITEM_TO_PATH_MAP[item])}
          as={RouterLink}
          isActive={activeItem === item}
        />
      ))}
    </SidebarNav>
  );
};

export default MainLayoutSidebar;
