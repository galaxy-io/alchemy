import { type FC, useState } from "react";

import { create } from "@bufbuild/protobuf";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import DurationInput from "@galaxy-io/dls/inputs/DurationInput";
import NumberInput from "@galaxy-io/dls/inputs/NumberInput";
import Flex, { FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  type Function as AlchemyFunction,
  UpdateFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import {
  CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS,
  CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS,
} from "@/pages/functions/components/create/constants";
import { FUNCTION_LIMITS_INPUT_WIDTH } from "@/pages/functions/constants";

import { useUpdateFunctionMutation } from "@/api/queries/functions";

import { getErrorMessage } from "@/utils/errors";

interface FunctionSettingsPageLimitsState {
  timeoutMs: number;
  maxConcurrency: number | null;
}

interface FunctionSettingsPageLimitsProps {
  alchemyFunction: AlchemyFunction;
}

const FunctionSettingsPageLimits: FC<FunctionSettingsPageLimitsProps> = ({ alchemyFunction }) => {
  const { toast } = useToast();
  const { mutate: updateFunction, isPending: isSaving } = useUpdateFunctionMutation();

  const createInitialState = (): FunctionSettingsPageLimitsState => ({
    timeoutMs: Number(alchemyFunction.timeoutMs),
    maxConcurrency: alchemyFunction.maxConcurrency || null,
  });

  const [state, setState] = useState<FunctionSettingsPageLimitsState>(createInitialState);

  const maxConcurrency = state.maxConcurrency ?? 0;
  const hasChanges =
    state.timeoutMs !== Number(alchemyFunction.timeoutMs) ||
    maxConcurrency !== alchemyFunction.maxConcurrency;

  const handleChange = (patch: Partial<FunctionSettingsPageLimitsState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = () => {
    updateFunction(
      create(UpdateFunctionRequestSchema, {
        functionId: alchemyFunction.id,
        name: alchemyFunction.name,
        description: alchemyFunction.description,
        timeoutMs: BigInt(Math.round(state.timeoutMs)),
        maxConcurrency,
      }),
      {
        onSuccess: () => {
          toast({ header: "Limits saved", variant: ToastVariant.SUCCESS });
        },
        onError: (error) => {
          toast({
            header: "Save failed",
            description: getErrorMessage(error, "Failed to save limits"),
            variant: ToastVariant.ERROR,
          });
        },
      },
    );
  };

  return (
    <Widget header="Limits" isCollapsible defaultIsOpen>
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        <Flex direction={FlexDirection.COLUMN} gap={12} maxWidth={FUNCTION_LIMITS_INPUT_WIDTH}>
          <DurationInput
            label="Timeout"
            labelTooltip="How long one invocation may run, for every version"
            value={state.timeoutMs}
            min={CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS}
            max={CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS}
            onChange={(ms) =>
              handleChange({ timeoutMs: ms ?? CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS })
            }
            fillWidth
          />
          <NumberInput
            label="Max concurrency"
            labelTooltip="Invocations past it wait in the queue"
            value={state.maxConcurrency}
            min={1}
            step={1}
            precision={0}
            hasSteppers
            placeholder="No limit"
            onChange={(value) => handleChange({ maxConcurrency: value })}
            fillWidth
          />
        </Flex>
        <Flex justifyContent={JustifyContent.END} gap={8}>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            isDisabled={!hasChanges || isSaving}
            onClick={() => setState(createInitialState())}
          />
          <Button label="Save" isDisabled={!hasChanges} isLoading={isSaving} onClick={handleSave} />
        </Flex>
      </Flex>
    </Widget>
  );
};

export default FunctionSettingsPageLimits;
