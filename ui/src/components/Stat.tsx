import type { FC } from "react";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { type TextProps, TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

interface StatProps {
  label: string;
  value: string;
  align?: TextProps["align"];
}

const Stat: FC<StatProps> = ({ label, value, align }) => (
  <Flex direction={FlexDirection.COLUMN} gap={4} minWidth={0}>
    <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY} align={align}>
      {label}
    </Text>
    <Text
      size={TextSize.BODY_SM}
      family={FontFamily.MONO}
      align={align}
      lineClamp={1}
      shouldTooltipOnOverflow
      isTabular
    >
      {value}
    </Text>
  </Flex>
);

export default Stat;
