import type { FC } from "react";

import { PlayIcon } from "@phosphor-icons/react";

import { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import CopyButton from "@galaxy-io/dls/buttons/CopyButton";
import Box from "@galaxy-io/dls/layout/Box";
import EmptyLayout, { EmptyLayoutSize } from "@galaxy-io/dls/layout/EmptyLayout";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import Link from "@galaxy-io/dls/links/Link";
import CodeBlock, { CodeBlockLanguage } from "@galaxy-io/dls/text/CodeBlock";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import Flasher from "@galaxy-io/dls/transform/Flasher";

import type { Contract } from "@/gen/functions/v1/common_pb";
import type { InvokeResponse } from "@/gen/functions/v1/invocations_pb";

import InvocationLogsSplit from "@/components/invocations/InvocationLogsSplit";
import InvocationOutcome from "@/components/invocations/InvocationOutcome";

import { FUNCTION_WORKBENCH_RESULT_STORAGE_KEY } from "@/pages/functions/workbench/constants";
import { decodeFunctionWorkbenchOutput } from "@/pages/functions/workbench/utils";

import { useAlchemySearchUpdate } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";

import { createGetInvocationInput, useGetInvocationQuery } from "@/api/queries/invocations";

import { formatJson } from "@/utils/json";

interface FunctionWorkbenchResultProps {
  response: InvokeResponse | undefined;
  contract: Contract | undefined;
  isRunning: boolean;
}

const FunctionWorkbenchResult: FC<FunctionWorkbenchResultProps> = ({
  response,
  contract,
  isRunning,
}) => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();

  const { data, isLoading } = useGetInvocationQuery({
    input: createGetInvocationInput(response?.invocationId ?? ""),
    options: { enabled: !!response },
  });
  const invocation = data?.invocation;

  if (!invocation && !isRunning && !isLoading) {
    return (
      <EmptyLayout size={EmptyLayoutSize.SMALL} icon={PlayIcon} header="Run to see the output" />
    );
  }

  if (!invocation) {
    return (
      <Box padding={16}>
        <Flasher isFlashing>
          <Text size={TextSize.CAPTION} family={FontFamily.MONO} variant={TextVariant.TERTIARY}>
            Acquiring an instance...
          </Text>
        </Flasher>
      </Box>
    );
  }

  const output =
    response?.result.case === "output"
      ? decodeFunctionWorkbenchOutput(response.result.value, contract)
      : undefined;

  return (
    <InvocationLogsSplit
      id="function-workbench-result"
      storageKey={FUNCTION_WORKBENCH_RESULT_STORAGE_KEY}
      invocationId={invocation.id}
    >
      <Flex alignItems={AlignItems.CENTER} gap={8} minWidth={0}>
        <Link
          onClick={() =>
            void updateSearch((prev) => ({
              ...prev,
              invocationId: invocation.id,
              invocationAttempt: undefined,
            }))
          }
        >
          <Text size={TextSize.BODY_SM} family={FontFamily.MONO} lineClamp={1}>
            {invocation.id}
          </Text>
        </Link>
        <CopyButton
          value={invocation.id}
          ariaLabel="Copy invocation ID"
          variant={ButtonVariant.TERTIARY}
          size={ButtonSize.X_SMALL}
        />
      </Flex>
      <InvocationOutcome invocation={invocation} />
      {output !== undefined && (
        <CodeBlock
          label="Output"
          language={CodeBlockLanguage.JSON}
          content={formatJson(output)}
          canCopy
        />
      )}
    </InvocationLogsSplit>
  );
};

export default FunctionWorkbenchResult;
