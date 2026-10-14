import type { PropsWithChildren, ReactNode } from "react";

import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextWeight } from "@galaxy-io/dls/text/Text";

import {
  PAGE_LAYOUT_HEADER_HEIGHT,
  PAGE_LAYOUT_HEADER_INSET,
  PAGE_LAYOUT_HEADER_ROW_HEIGHT,
} from "@/layouts/page/constants";

interface PageLayoutProps {
  title: string;
  banner?: ReactNode;
  heading?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  toolbar?: ReactNode;
}

const PageLayout = ({
  title,
  banner,
  heading,
  actions,
  tabs,
  toolbar,
  children,
}: PropsWithChildren<PageLayoutProps>) => {
  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
      {banner}
      <Flex direction={FlexDirection.COLUMN} shrink={0}>
        <Flex
          direction={FlexDirection.COLUMN}
          justifyContent={JustifyContent.END}
          height={PAGE_LAYOUT_HEADER_HEIGHT}
          padding={[0, 16, PAGE_LAYOUT_HEADER_INSET]}
        >
          <Flex
            alignItems={AlignItems.CENTER}
            justifyContent={JustifyContent.SPACE_BETWEEN}
            gap={16}
            minHeight={PAGE_LAYOUT_HEADER_ROW_HEIGHT}
          >
            <Flex alignItems={AlignItems.CENTER} gap={8} minWidth={0}>
              {heading ?? (
                <Text as="h1" size={TextSize.HEADING_MD} weight={TextWeight.MEDIUM} lineClamp={1}>
                  {title}
                </Text>
              )}
            </Flex>
            {actions && (
              <Flex alignItems={AlignItems.CENTER} gap={8} shrink={0}>
                {actions}
              </Flex>
            )}
          </Flex>
        </Flex>
        <Divider />
        {tabs}
        {toolbar && (
          <>
            <Flex alignItems={AlignItems.CENTER} gap={8} padding={[8, 16]}>
              {toolbar}
            </Flex>
            <Divider />
          </>
        )}
      </Flex>
      <Flex
        as="main"
        direction={FlexDirection.COLUMN}
        grow={1}
        basis={0}
        minHeight={0}
        overflow="auto"
      >
        {children}
      </Flex>
    </Flex>
  );
};

export default PageLayout;
