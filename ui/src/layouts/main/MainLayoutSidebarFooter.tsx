import PoweredBy, { PoweredByWordmark } from "@galaxy-io/dls/brand/PoweredBy";
import { AppFrameToggle } from "@galaxy-io/dls/layout/AppFrame";
import Flex, { AlignItems, JustifyContent } from "@galaxy-io/dls/layout/Flex";

import { GITHUB_REPO_URL } from "@/constants";

const MainLayoutSidebarFooter = () => (
  <Flex alignItems={AlignItems.CENTER} justifyContent={JustifyContent.SPACE_BETWEEN} height={40}>
    <PoweredBy
      wordmark={PoweredByWordmark.ALCHEMY}
      href={GITHUB_REPO_URL}
      ariaLabel="Alchemy on GitHub"
    />
    <AppFrameToggle />
  </Flex>
);

export default MainLayoutSidebarFooter;
