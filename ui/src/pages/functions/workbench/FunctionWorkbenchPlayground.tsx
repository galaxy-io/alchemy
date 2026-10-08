import { useMemo, useState } from "react";

import { create } from "@bufbuild/protobuf";
import { PlayIcon } from "@phosphor-icons/react";

import Button, { ButtonSize } from "@galaxy-io/dls/buttons/Button";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import ResizablePanels, { ResizablePanel } from "@galaxy-io/dls/layout/ResizablePanels";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import Text, { TextSize, TextWeight } from "@galaxy-io/dls/text/Text";
import { Orientation } from "@galaxy-io/dls/theme/enums";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";

import type { Contract } from "@/gen/functions/v1/common_pb";
import type { Function as AlchemyFunction, FunctionVersion } from "@/gen/functions/v1/functions_pb";
import { InvokeRequestSchema } from "@/gen/functions/v1/invocations_pb";

import {
  FUNCTION_WORKBENCH_PLAYGROUND_INPUT_DEFAULT_HEIGHT,
  FUNCTION_WORKBENCH_PLAYGROUND_INPUT_MAX_HEIGHT,
  FUNCTION_WORKBENCH_PLAYGROUND_INPUT_MIN_HEIGHT,
  FUNCTION_WORKBENCH_PLAYGROUND_STORAGE_KEY,
} from "@/pages/functions/workbench/constants";
import FunctionWorkbenchPlaygroundInput from "@/pages/functions/workbench/FunctionWorkbenchPlaygroundInput";
import FunctionWorkbenchPlaygroundResult from "@/pages/functions/workbench/FunctionWorkbenchPlaygroundResult";
import type { FunctionWorkbenchPlaygroundState } from "@/pages/functions/workbench/types";
import {
  createFunctionWorkbenchDefaultInput,
  encodeFunctionWorkbenchInput,
  getFunctionWorkbenchArrowSchema,
  getFunctionWorkbenchInputError,
} from "@/pages/functions/workbench/utils";

import { useInvokeMutation } from "@/api/queries/invocations";

import { getErrorMessage } from "@/utils/errors";
import { formatJson, parseJson } from "@/utils/json";

interface FunctionWorkbenchPlaygroundProps {
  functionId: AlchemyFunction["id"];
  version: FunctionVersion["version"] | undefined;
  contract: Contract | undefined;
}

const FunctionWorkbenchPlayground = ({
  functionId,
  version,
  contract,
}: FunctionWorkbenchPlaygroundProps) => {
  const { toast } = useToast();
  const { mutate: invoke, isPending: isRunning } = useInvokeMutation();

  const arrowSchema = useMemo(() => getFunctionWorkbenchArrowSchema(contract), [contract]);
  const [state, setState] = useState<FunctionWorkbenchPlaygroundState>(() => ({
    text: formatJson(createFunctionWorkbenchDefaultInput(arrowSchema)),
    response: undefined,
  }));

  const parsed = parseJson(state.text);
  const inputError = parsed.error ?? getFunctionWorkbenchInputError(parsed.value, arrowSchema);
  const canRun = inputError === undefined && version !== undefined && !isRunning;

  const handleTextChange = (text: string) => {
    setState((prev) => ({ ...prev, text }));
  };

  const handleRun = () => {
    if (!canRun || parsed.value === undefined) return;
    let input: Uint8Array;
    try {
      input = encodeFunctionWorkbenchInput(parsed.value, arrowSchema);
    } catch (error) {
      toast({
        header: "Run failed",
        description: getErrorMessage(error, "The rows do not match the input schema"),
        variant: ToastVariant.ERROR,
      });
      return;
    }
    invoke(create(InvokeRequestSchema, { functionId, version, input }), {
      onSuccess: (response) => {
        setState((prev) => ({ ...prev, response }));
      },
      onError: (error) => {
        toast({
          header: "Run failed",
          description: getErrorMessage(error, "Failed to invoke function"),
          variant: ToastVariant.ERROR,
        });
      },
    });
  };

  return (
    <Flex direction={FlexDirection.COLUMN} height="100%" minHeight={0}>
      <Flex
        alignItems={AlignItems.CENTER}
        justifyContent={JustifyContent.SPACE_BETWEEN}
        gap={8}
        padding={[8, 12]}
        shrink={0}
      >
        <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM}>
          Playground
        </Text>
        <Button
          label="Run"
          icon={PlayIcon}
          size={ButtonSize.SMALL}
          isDisabled={!canRun}
          isLoading={isRunning}
          hotKeys={["mod", "enter"]}
          onClick={handleRun}
        />
      </Flex>
      <Divider />
      <Flex grow={1} minHeight={0}>
        <ResizablePanels
          orientation={Orientation.VERTICAL}
          storageKey={FUNCTION_WORKBENCH_PLAYGROUND_STORAGE_KEY}
        >
          <ResizablePanel
            id="input"
            defaultValue={FUNCTION_WORKBENCH_PLAYGROUND_INPUT_DEFAULT_HEIGHT}
            min={FUNCTION_WORKBENCH_PLAYGROUND_INPUT_MIN_HEIGHT}
            max={FUNCTION_WORKBENCH_PLAYGROUND_INPUT_MAX_HEIGHT}
            ariaLabel="Input"
          >
            <FunctionWorkbenchPlaygroundInput
              value={state.text}
              error={inputError}
              onChange={handleTextChange}
              onExecute={handleRun}
            />
          </ResizablePanel>
          <ResizablePanel id="result">
            <Flex direction={FlexDirection.COLUMN} height="100%" minHeight={0}>
              <Divider />
              <ScrollArea>
                <Flex direction={FlexDirection.COLUMN} gap={12} padding={12}>
                  <FunctionWorkbenchPlaygroundResult
                    response={state.response}
                    contract={contract}
                    isRunning={isRunning}
                  />
                </Flex>
              </ScrollArea>
            </Flex>
          </ResizablePanel>
        </ResizablePanels>
      </Flex>
    </Flex>
  );
};

export default FunctionWorkbenchPlayground;
