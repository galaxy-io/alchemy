import { type FC, memo } from "react";

import { styled } from "@linaria/react";

import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import FlexItem from "@galaxy-io/dls/layout/FlexItem";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

const InvocationLogsLineText = styled.div`
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

interface InvocationLogsLineProps {
  number: number;
  line: string;
}

const InvocationLogsLine: FC<InvocationLogsLineProps> = ({ number, line }) => (
  <Flex alignItems={AlignItems.BASELINE} gap={8}>
    <FlexItem shrink={0}>
      <Text size={TextSize.BODY_SM} variant={TextVariant.TERTIARY} family={FontFamily.MONO}>
        {number}
      </Text>
    </FlexItem>
    <InvocationLogsLineText>
      <Text
        size={TextSize.BODY_SM}
        variant={TextVariant.SECONDARY}
        family={FontFamily.MONO}
        isSelectable
      >
        {line}
      </Text>
    </InvocationLogsLineText>
  </Flex>
);

export default memo(InvocationLogsLine);
