import type { ReactNode } from "react";

import Flex, { AlignItems, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

interface KeyValueRowProps {
  label: string;
  value: ReactNode;
  isMono?: boolean;
}

const KeyValueRow = ({ label, value, isMono = false }: KeyValueRowProps) => {
  return (
    <Flex
      alignItems={AlignItems.CENTER}
      justifyContent={JustifyContent.SPACE_BETWEEN}
      gap={16}
      fillWidth
    >
      <Flex alignItems={AlignItems.CENTER} gap={8} shrink={0}>
        <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM}>
          {label}
        </Text>
      </Flex>
      <Flex minWidth={0} justifyContent={JustifyContent.END}>
        {typeof value === "string" || typeof value === "number" ? (
          <Text
            size={TextSize.BODY_SM}
            family={isMono ? FontFamily.MONO : FontFamily.SANS}
            variant={TextVariant.SECONDARY}
            lineClamp={1}
            shouldTooltipOnOverflow
            align="right"
            isSelectable
          >
            {value}
          </Text>
        ) : (
          value
        )}
      </Flex>
    </Flex>
  );
};

export default KeyValueRow;
