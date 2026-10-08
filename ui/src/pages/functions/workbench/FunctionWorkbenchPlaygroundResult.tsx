import { create } from "@bufbuild/protobuf";

import Alert, { AlertVariant } from "@galaxy-io/dls/feedback/Alert";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Link from "@galaxy-io/dls/links/Link";
import CodeBlock, { CodeBlockLanguage } from "@galaxy-io/dls/text/CodeBlock";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import Flasher from "@galaxy-io/dls/transform/Flasher";

import type { Contract } from "@/gen/functions/v1/common_pb";
import { GetInvocationRequestSchema, type InvokeResponse } from "@/gen/functions/v1/invocations_pb";

import { FUNCTION_WORKBENCH_RESULT_ID_LENGTH } from "@/pages/functions/workbench/constants";
import { decodeFunctionWorkbenchOutput } from "@/pages/functions/workbench/utils";
import InvocationPhaseBar from "@/pages/invocations/components/InvocationPhaseBar";
import InvocationStatus from "@/pages/invocations/components/InvocationStatus";
import { FUNCTION_ERROR_KIND_TO_LABEL_MAP } from "@/pages/invocations/constants";

import { useGetInvocationQuery } from "@/api/queries/invocations";

import { useAlchemySearchUpdate } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";
import { formatJson } from "@/utils/json";

interface FunctionWorkbenchPlaygroundResultProps {
  response: InvokeResponse | undefined;
  contract: Contract | undefined;
  isRunning: boolean;
}

const FunctionWorkbenchPlaygroundResult = ({
  response,
  contract,
  isRunning,
}: FunctionWorkbenchPlaygroundResultProps) => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();

  const { data, isLoading } = useGetInvocationQuery({
    input: create(GetInvocationRequestSchema, { id: response?.invocationId ?? "" }),
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
        Run to see the output.
      </Text>
    );
  }

  // Payloads are not persisted, so the output comes from the Invoke response.
  const output =
    response?.result.case === "output"
      ? decodeFunctionWorkbenchOutput(response.result.value, contract)
      : undefined;
  const error = invocation.error;

  const handleOpen = () => {
    void updateSearch((prev) => ({ ...prev, invocationId: invocation.id }));
  };

  return (
    <Flex direction={FlexDirection.COLUMN} gap={12}>
      <Flex justifyContent={JustifyContent.SPACE_BETWEEN} alignItems={AlignItems.CENTER}>
        <InvocationStatus invocation={invocation} />
        <Link onClick={handleOpen}>
          <Text size={TextSize.CAPTION} family={FontFamily.MONO}>
            {invocation.id.slice(0, FUNCTION_WORKBENCH_RESULT_ID_LENGTH)}
          </Text>
        </Link>
      </Flex>
      {invocation.stats && <InvocationPhaseBar stats={invocation.stats} />}
      {error && (
        <Alert
          variant={AlertVariant.ERROR}
          header={`${FUNCTION_ERROR_KIND_TO_LABEL_MAP[error.kind]}${error.type ? ` · ${error.type}` : ""}`}
        >
          <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isSelectable>
            {error.message}
          </Text>
          {error.violations.map((violation) => (
            <Text
              key={violation.instancePath}
              size={TextSize.CAPTION}
              family={FontFamily.MONO}
              isSelectable
            >
              {violation.instancePath || "/"} {violation.message}
            </Text>
          ))}
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
      {invocation.logTail !== "" && (
        <CodeBlock
          label="stderr"
          language={CodeBlockLanguage.PLAIN}
          content={invocation.logTail}
          canCopy
        />
      )}
    </Flex>
  );
};

export default FunctionWorkbenchPlaygroundResult;
