import type { FC } from "react";

import Alert, { AlertVariant } from "@galaxy-io/dls/feedback/Alert";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Link from "@galaxy-io/dls/links/Link";
import CodeBlock, { CodeBlockLanguage } from "@galaxy-io/dls/text/CodeBlock";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import Flasher from "@galaxy-io/dls/transform/Flasher";

import type { Contract } from "@/gen/functions/v1/common_pb";
import type { InvokeResponse } from "@/gen/functions/v1/invocations_pb";

import { FUNCTION_ERROR_KIND_TO_LABEL_MAP } from "@/components/invocations/constants";
import InvocationError from "@/components/invocations/InvocationError";
import InvocationLogs from "@/components/invocations/InvocationLogs";
import InvocationPhaseBar from "@/components/invocations/InvocationPhaseBar";
import InvocationStatus from "@/components/invocations/InvocationStatus";

import { FUNCTION_WORKBENCH_RESULT_ID_LENGTH } from "@/pages/functions/workbench/constants";
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

  if (!invocation) {
    return isRunning || isLoading ? (
      <Flasher isFlashing>
        <Text size={TextSize.CAPTION} family={FontFamily.MONO} variant={TextVariant.TERTIARY}>
          Acquiring an instance...
        </Text>
      </Flasher>
    ) : (
      <Text size={TextSize.BODY_SM} variant={TextVariant.TERTIARY}>
        Run to see the output
      </Text>
    );
  }

  const output =
    response?.result.case === "output"
      ? decodeFunctionWorkbenchOutput(response.result.value, contract)
      : undefined;
  const { error } = invocation;

  return (
    <Flex direction={FlexDirection.COLUMN} gap={12}>
      <Flex justifyContent={JustifyContent.SPACE_BETWEEN} alignItems={AlignItems.CENTER}>
        <InvocationStatus invocation={invocation} />
        <Link
          onClick={() => void updateSearch((prev) => ({ ...prev, invocationId: invocation.id }))}
        >
          <Text size={TextSize.CAPTION} family={FontFamily.MONO}>
            {invocation.id.slice(0, FUNCTION_WORKBENCH_RESULT_ID_LENGTH)}
          </Text>
        </Link>
      </Flex>
      {invocation.stats && <InvocationPhaseBar stats={invocation.stats} />}
      {error && (
        <Alert variant={AlertVariant.ERROR} header={FUNCTION_ERROR_KIND_TO_LABEL_MAP[error.kind]}>
          <InvocationError error={error} />
        </Alert>
      )}
      {output !== undefined && (
        <CodeBlock
          label="Output"
          language={CodeBlockLanguage.JSON}
          content={formatJson(output)}
          canCopy
        />
      )}
      <InvocationLogs invocationId={invocation.id} />
    </Flex>
  );
};

export default FunctionWorkbenchResult;
