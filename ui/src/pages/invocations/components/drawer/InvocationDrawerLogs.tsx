import type { FC } from "react";

import Flex, { JustifyContent } from "@galaxy-io/dls/layout/Flex";
import CodeBlock, { CodeBlockLanguage } from "@galaxy-io/dls/text/CodeBlock";
import Text, { TextVariant } from "@galaxy-io/dls/text/Text";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

interface InvocationDrawerLogsProps {
  logTail: Invocation["logTail"];
}

const InvocationDrawerLogs: FC<InvocationDrawerLogsProps> = ({ logTail }) => {
  if (!logTail) {
    return (
      <Flex padding={24} justifyContent={JustifyContent.CENTER}>
        <Text variant={TextVariant.TERTIARY}>Nothing on stderr</Text>
      </Flex>
    );
  }

  return <CodeBlock label="Logs" content={logTail} language={CodeBlockLanguage.PLAIN} canCopy />;
};

export default InvocationDrawerLogs;
