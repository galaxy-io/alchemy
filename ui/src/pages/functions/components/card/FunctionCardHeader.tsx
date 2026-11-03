import type { FC } from "react";

import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextWeight } from "@galaxy-io/dls/text/Text";

import type { Runtime } from "@/gen/functions/v1/functions_pb";

import { FUNCTION_CARD_ICON_SIZE } from "@/pages/functions/components/card/constants";
import FunctionRuntimeIcon from "@/pages/functions/components/FunctionRuntimeIcon";

interface FunctionCardHeaderProps {
  name: string;
  runtime: Runtime;
}

const FunctionCardHeader: FC<FunctionCardHeaderProps> = ({ name, runtime }) => (
  <Flex alignItems={AlignItems.CENTER} gap={8}>
    <FunctionRuntimeIcon runtime={runtime} size={FUNCTION_CARD_ICON_SIZE} />
    <Text as="span" size={TextSize.BODY_MD} weight={TextWeight.MEDIUM}>
      {name}
    </Text>
  </Flex>
);

export default FunctionCardHeader;
