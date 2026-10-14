import type { FC } from "react";

import { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import CopyButton from "@galaxy-io/dls/buttons/CopyButton";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextWeight } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

interface InvocationDrawerHeaderProps {
  invocationId: Invocation["id"];
}

const InvocationDrawerHeader: FC<InvocationDrawerHeaderProps> = ({ invocationId }) => (
  <Flex alignItems={AlignItems.CENTER} gap={8} minWidth={0}>
    <Text
      as="h2"
      size={TextSize.BODY_LG}
      weight={TextWeight.MEDIUM}
      family={FontFamily.MONO}
      lineClamp={1}
    >
      {invocationId}
    </Text>
    <CopyButton
      value={invocationId}
      ariaLabel="Copy invocation ID"
      variant={ButtonVariant.TERTIARY}
      size={ButtonSize.X_SMALL}
    />
  </Flex>
);

export default InvocationDrawerHeader;
