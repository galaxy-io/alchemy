import { type FC, useState } from "react";

import { create } from "@bufbuild/protobuf";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import DurationInput from "@galaxy-io/dls/inputs/DurationInput";
import NumberInput from "@galaxy-io/dls/inputs/NumberInput";
import SliderInput from "@galaxy-io/dls/inputs/SliderInput";
import Flex, { FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";
import { Radius } from "@galaxy-io/dls/theme/enums";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  type Function as AlchemyFunction,
  UpdateFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import {
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_STEP,
  CREATE_FUNCTION_MODAL_MEMORY_SLIDER_MARKS,
  CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS,
  CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS,
  CREATE_FUNCTION_MODAL_VCPUS_MAX,
  CREATE_FUNCTION_MODAL_VCPUS_MIN,
  CREATE_FUNCTION_MODAL_VCPUS_SLIDER_MARKS,
} from "@/pages/functions/components/create/constants";
import { FUNCTION_LIMITS_COLUMNS } from "@/pages/functions/constants";

import { useUpdateFunctionMutation } from "@/api/queries/functions";

import { getErrorMessage } from "@/utils/errors";
import { formatMemory } from "@/utils/format";

interface FunctionSettingsPageLimitsState {
  vcpus: number;
  memoryMib: number;
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
    vcpus: alchemyFunction.resources?.vcpus ?? CREATE_FUNCTION_MODAL_VCPUS_MIN,
    memoryMib: alchemyFunction.resources?.memoryMib ?? CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN,
    timeoutMs: Number(alchemyFunction.timeoutMs),
    maxConcurrency: alchemyFunction.maxConcurrency || null,
  });

  const [state, setState] = useState<FunctionSettingsPageLimitsState>(createInitialState);

  const maxConcurrency = state.maxConcurrency ?? 0;
  const hasChanges =
    state.vcpus !== alchemyFunction.resources?.vcpus ||
    state.memoryMib !== alchemyFunction.resources?.memoryMib ||
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
        resources: { vcpus: state.vcpus, memoryMib: state.memoryMib },
      }),
      {
        onSuccess: () => {
          toast({ header: "Resources saved", variant: ToastVariant.SUCCESS });
        },
        onError: (error) => {
          toast({
            header: "Save failed",
            description: getErrorMessage(error, "Failed to save resources"),
            variant: ToastVariant.ERROR,
          });
        },
      },
    );
  };

  return (
    <Widget header="Resources" isCollapsible defaultIsOpen>
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        <Flex hasBorder radius={Radius.LG} padding={12}>
          <SliderInput
            label="vCPUs"
            min={CREATE_FUNCTION_MODAL_VCPUS_MIN}
            max={CREATE_FUNCTION_MODAL_VCPUS_MAX}
            step={1}
            marks={CREATE_FUNCTION_MODAL_VCPUS_SLIDER_MARKS}
            value={state.vcpus}
            onChange={(vcpus) => handleChange({ vcpus })}
            fillWidth
          />
        </Flex>
        <Flex hasBorder radius={Radius.LG} padding={12}>
          <SliderInput
            label="Memory"
            min={CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN}
            max={CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX}
            step={CREATE_FUNCTION_MODAL_MEMORY_MIB_STEP}
            marks={CREATE_FUNCTION_MODAL_MEMORY_SLIDER_MARKS}
            formatValue={formatMemory}
            value={state.memoryMib}
            onChange={(memoryMib) => handleChange({ memoryMib })}
            fillWidth
          />
        </Flex>
        <Grid columns={FUNCTION_LIMITS_COLUMNS} gap={12}>
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
        </Grid>
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
