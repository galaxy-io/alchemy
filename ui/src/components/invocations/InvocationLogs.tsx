import { type FC, useRef } from "react";

import { styled } from "@linaria/react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import CopyButton from "@galaxy-io/dls/buttons/CopyButton";
import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
import { FontFamily, Radius } from "@galaxy-io/dls/theme/enums";
import Flasher from "@galaxy-io/dls/transform/Flasher";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import {
  INVOCATION_LOGS_ESTIMATED_LINE_HEIGHT,
  INVOCATION_LOGS_HEADER_HEIGHT,
  INVOCATION_LOGS_LINE_GAP,
  INVOCATION_LOGS_MAX_HEIGHT,
} from "@/components/invocations/constants";
import InvocationLogsLine from "@/components/invocations/InvocationLogsLine";
import { getInvocationLogsShownLines } from "@/components/invocations/utils";

import { useGetInvocationLogsStream } from "@/api/queries/invocations";

import { useStickToBottom } from "@/hooks/useStickToBottom";

const InvocationLogsList = styled.div`
  position: relative;
  flex-shrink: 0;
  width: 100%;
`;

const InvocationLogsListLine = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
`;

interface InvocationLogsProps {
  invocationId: Invocation["id"];
}

const InvocationLogs: FC<InvocationLogsProps> = ({ invocationId }) => {
  const { logs, isStreaming, isError } = useGetInvocationLogsStream(invocationId);
  const lines = getInvocationLogsShownLines(logs.lines);

  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  useStickToBottom(bodyRef, contentRef, lines.length > 0);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: lines.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => INVOCATION_LOGS_ESTIMATED_LINE_HEIGHT,
    getItemKey: (index) => logs.offset + index,
    gap: INVOCATION_LOGS_LINE_GAP,
  });

  return (
    <Box variant={BoxVariant.SECONDARY} hasBorder radius={Radius.LG} overflow="hidden" fillWidth>
      <Flex direction={FlexDirection.COLUMN}>
        <Flex
          alignItems={AlignItems.CENTER}
          justifyContent={JustifyContent.SPACE_BETWEEN}
          padding={[0, 4, 0, 12]}
          height={INVOCATION_LOGS_HEADER_HEIGHT}
        >
          <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM}>
            Logs
          </Text>
          {lines.length > 0 && (
            <CopyButton
              value={lines.join("\n")}
              ariaLabel="Copy logs"
              variant={ButtonVariant.TERTIARY}
              size={ButtonSize.SMALL}
            />
          )}
        </Flex>
        <Divider />
        <Box maxHeight={INVOCATION_LOGS_MAX_HEIGHT}>
          <ScrollArea ref={bodyRef}>
            <Flex
              ref={contentRef}
              direction={FlexDirection.COLUMN}
              gap={INVOCATION_LOGS_LINE_GAP}
              padding={[8, 12]}
            >
              {lines.length > 0 && (
                <InvocationLogsList style={{ height: virtualizer.getTotalSize() }}>
                  {virtualizer.getVirtualItems().map((item) => (
                    <InvocationLogsListLine
                      key={item.key}
                      ref={virtualizer.measureElement}
                      data-index={item.index}
                      style={{ transform: `translateY(${item.start}px)` }}
                    >
                      <InvocationLogsLine
                        number={logs.offset + item.index + 1}
                        line={lines[item.index]}
                      />
                    </InvocationLogsListLine>
                  ))}
                </InvocationLogsList>
              )}
              {isStreaming ? (
                <Text
                  size={TextSize.BODY_SM}
                  variant={TextVariant.TERTIARY}
                  family={FontFamily.MONO}
                >
                  <Flasher isFlashing>Listening...</Flasher>
                </Text>
              ) : (
                lines.length === 0 && (
                  <Text size={TextSize.BODY_SM} variant={TextVariant.TERTIARY}>
                    {isError ? "Failed to load logs" : "Nothing on stderr"}
                  </Text>
                )
              )}
            </Flex>
          </ScrollArea>
        </Box>
      </Flex>
    </Box>
  );
};

export default InvocationLogs;
