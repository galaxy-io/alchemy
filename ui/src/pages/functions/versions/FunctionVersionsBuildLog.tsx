import type { FC } from "react";

import { styled } from "@linaria/react";

import { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import CopyButton from "@galaxy-io/dls/buttons/CopyButton";
import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
import { Radius } from "@galaxy-io/dls/theme/enums";
import { t } from "@galaxy-io/dls/theme/tokens/t";

import type { FunctionVersion } from "@/gen/functions/v1/functions_pb";

import {
  FUNCTION_VERSIONS_BUILD_LOG_HEADER_HEIGHT,
  FUNCTION_VERSIONS_BUILD_LOG_MAX_HEIGHT,
  FUNCTION_VERSIONS_BUILD_LOG_PLACEHOLDER,
} from "@/pages/functions/versions/constants";

const LogLines = styled.pre`
  margin: 0;
  padding: ${t.space[12]};
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ${t.font.mono.family};
  font-size: ${t.font.mono.size.body_sm};
  line-height: ${t.font.mono.height.body_sm};
  color: ${t.color.text.secondary};
  user-select: text;
`;

interface FunctionVersionsBuildLogProps {
  buildLog: FunctionVersion["buildLog"];
}

const FunctionVersionsBuildLog: FC<FunctionVersionsBuildLogProps> = ({ buildLog }) => (
  <Box variant={BoxVariant.SECONDARY} hasBorder radius={Radius.LG} overflow="hidden" fillWidth>
    <Flex direction={FlexDirection.COLUMN}>
      <Flex
        alignItems={AlignItems.CENTER}
        justifyContent={JustifyContent.SPACE_BETWEEN}
        padding={[0, 4, 0, 12]}
        height={FUNCTION_VERSIONS_BUILD_LOG_HEADER_HEIGHT}
      >
        <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM}>
          Build log
        </Text>
        {buildLog && (
          <CopyButton
            value={buildLog}
            ariaLabel="Copy build log"
            variant={ButtonVariant.TERTIARY}
            size={ButtonSize.SMALL}
          />
        )}
      </Flex>
      <Divider />
      <Box maxHeight={FUNCTION_VERSIONS_BUILD_LOG_MAX_HEIGHT}>
        <ScrollArea>
          {buildLog ? (
            <LogLines>{buildLog}</LogLines>
          ) : (
            <Box padding={12}>
              <Text size={TextSize.BODY_SM} variant={TextVariant.TERTIARY}>
                {FUNCTION_VERSIONS_BUILD_LOG_PLACEHOLDER}
              </Text>
            </Box>
          )}
        </ScrollArea>
      </Box>
    </Flex>
  </Box>
);

export default FunctionVersionsBuildLog;
