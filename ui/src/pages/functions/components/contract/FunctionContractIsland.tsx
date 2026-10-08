import type { PropsWithChildren, ReactNode } from "react";

import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, {
  AlignItems,
  FlexDirection,
  FlexVariant,
  JustifyContent,
} from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
import { Radius } from "@galaxy-io/dls/theme/enums";

import { FUNCTION_CONTRACT_ISLAND_HEADER_HEIGHT } from "@/pages/functions/components/contract/constants";

interface FunctionContractIslandProps {
  label: string;
  caption?: string;
  error?: string;
  actions?: ReactNode;
}

const FunctionContractIsland = ({
  label,
  caption,
  error,
  actions,
  children,
}: PropsWithChildren<FunctionContractIslandProps>) => (
  <Flex
    direction={FlexDirection.COLUMN}
    grow={1}
    basis={0}
    minWidth={0}
    variant={FlexVariant.PRIMARY}
    hasBorder
    radius={Radius.LG}
    overflow="hidden"
  >
    <Flex
      alignItems={AlignItems.CENTER}
      justifyContent={JustifyContent.SPACE_BETWEEN}
      gap={8}
      padding={[0, 12]}
      height={FUNCTION_CONTRACT_ISLAND_HEADER_HEIGHT}
      shrink={0}
    >
      <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM}>
        {label}
      </Text>
      <Flex alignItems={AlignItems.CENTER} gap={8} minWidth={0}>
        {error ? (
          <Text size={TextSize.CAPTION} variant={TextVariant.ERROR} lineClamp={1}>
            {error}
          </Text>
        ) : (
          caption && (
            <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
              {caption}
            </Text>
          )
        )}
        {actions}
      </Flex>
    </Flex>
    <Divider />
    {children}
  </Flex>
);

export default FunctionContractIsland;
