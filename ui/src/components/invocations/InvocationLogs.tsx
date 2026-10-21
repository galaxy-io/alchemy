import type { FC } from "react";

import Flex, { JustifyContent } from "@galaxy-io/dls/layout/Flex";
import CodeBlock, { CodeBlockLanguage } from "@galaxy-io/dls/text/CodeBlock";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import Flasher from "@galaxy-io/dls/transform/Flasher";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import { createGetInvocationLogsInput, useGetInvocationLogsQuery } from "@/api/queries/invocations";

interface InvocationLogsProps {
  invocationId: Invocation["id"];
}

const InvocationLogs: FC<InvocationLogsProps> = ({ invocationId }) => {
  const {
    data: logs,
    isPending,
    isError,
    isFetching,
  } = useGetInvocationLogsQuery({
    input: createGetInvocationLogsInput(invocationId),
  });

  if (logs) {
    return <CodeBlock label="Logs" content={logs} language={CodeBlockLanguage.PLAIN} canCopy />;
  }

  return (
    <Flex padding={24} justifyContent={JustifyContent.CENTER}>
      {isPending || isFetching ? (
        <Flasher isFlashing>
          <Text size={TextSize.CAPTION} family={FontFamily.MONO} variant={TextVariant.TERTIARY}>
            Waiting for stderr...
          </Text>
        </Flasher>
      ) : (
        <Text variant={TextVariant.TERTIARY}>
          {isError ? "Failed to load logs" : "Nothing on stderr"}
        </Text>
      )}
    </Flex>
  );
};

export default InvocationLogs;
