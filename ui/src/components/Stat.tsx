import type { FC } from "react";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

interface StatProps {
  label: string;
  value: string;
}

const Stat: FC<StatProps> = ({ label, value }) => (
  <Flex direction={FlexDirection.COLUMN} gap={2}>
    <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
      {label}
    </Text>
    <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isTabular>
      {value}
    </Text>
  </Flex>
);

export default Stat;
