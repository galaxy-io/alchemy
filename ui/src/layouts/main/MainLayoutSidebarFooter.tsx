import { styled } from "@linaria/react";

import GalaxyAlchemyWordmark from "@galaxy-io/dls/brand/GalaxyAlchemyWordmark";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { t } from "@galaxy-io/dls/theme/tokens/t";

import { MAIN_LAYOUT_WORDMARK_SIZE } from "@/layouts/main/constants";

import { GITHUB_REPO_URL } from "@/constants";

// A bare anchor: DLS Link would append its external-arrow mark after the logo.
const WordmarkLink = styled.a`
  display: inline-flex;
  align-items: center;
  color: inherit;
  border-radius: ${t.radius.sm};
  transition: opacity 100ms ease;

  &:hover {
    opacity: 0.8;
  }

  &:focus-visible {
    outline: 1px solid ${t.color.border.focused};
    outline-offset: 2px;
  }
`;

const MainLayoutSidebarFooter = () => {
  return (
    <Flex alignItems={AlignItems.CENTER} gap={8} minWidth={0} padding={[8, 4, 8, 12]}>
      <Text size={TextSize.BODY_SM} variant={TextVariant.TERTIARY}>
        Powered by
      </Text>
      <WordmarkLink
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Alchemy on GitHub (opens in a new tab)"
      >
        <GalaxyAlchemyWordmark size={MAIN_LAYOUT_WORDMARK_SIZE} />
      </WordmarkLink>
    </Flex>
  );
};

export default MainLayoutSidebarFooter;
