import type { PropsWithChildren } from "react";

import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { FlexDirection, FlexVariant } from "@galaxy-io/dls/layout/Flex";
import { Orientation, Radius } from "@galaxy-io/dls/theme/enums";

import { MAIN_LAYOUT_GUTTER } from "@/layouts/main/constants";
import MainLayoutSidebar from "@/layouts/main/MainLayoutSidebar";

const MainLayout = ({ children }: PropsWithChildren) => {
  return (
    <Box variant={BoxVariant.BASE} height="100%" overflow="hidden" padding={MAIN_LAYOUT_GUTTER}>
      <Flex
        height="100%"
        variant={FlexVariant.PRIMARY}
        hasBorder
        radius={Radius.LG}
        overflow="hidden"
      >
        <MainLayoutSidebar />
        <Divider orientation={Orientation.VERTICAL} />
        <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minWidth={0} minHeight={0}>
          {children}
        </Flex>
      </Flex>
    </Box>
  );
};

export default MainLayout;
