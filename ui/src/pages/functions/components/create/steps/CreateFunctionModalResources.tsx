import type { FC } from "react";

import DurationInput from "@galaxy-io/dls/inputs/DurationInput";
import NumberInput from "@galaxy-io/dls/inputs/NumberInput";
import SliderInput from "@galaxy-io/dls/inputs/SliderInput";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";
import { Radius } from "@galaxy-io/dls/theme/enums";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_STEP,
  CREATE_FUNCTION_MODAL_MEMORY_SLIDER_MARKS,
  CREATE_FUNCTION_MODAL_RESOURCES_MAX_WIDTH,
  CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS,
  CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS,
  CREATE_FUNCTION_MODAL_VCPUS_MAX,
  CREATE_FUNCTION_MODAL_VCPUS_MIN,
  CREATE_FUNCTION_MODAL_VCPUS_SLIDER_MARKS,
} from "@/pages/functions/components/create/constants";
import { FUNCTION_LIMITS_COLUMNS } from "@/pages/functions/constants";

import { formatMemory } from "@/utils/format";

const CreateFunctionModalResources: FC = () => {
  const { vcpus, memoryMib, timeoutMs, maxConcurrency } = useCreateFunctionModalState();
  const { setVcpus, setMemoryMib, setTimeoutMs, setMaxConcurrency } =
    useCreateFunctionModalActions();

  return (
    <Flex
      direction={FlexDirection.COLUMN}
      gap={12}
      maxWidth={CREATE_FUNCTION_MODAL_RESOURCES_MAX_WIDTH}
    >
      <Widget header="MicroVM">
        <Flex direction={FlexDirection.COLUMN} gap={12}>
          <Flex hasBorder radius={Radius.LG} padding={12}>
            <SliderInput
              label="vCPUs"
              min={CREATE_FUNCTION_MODAL_VCPUS_MIN}
              max={CREATE_FUNCTION_MODAL_VCPUS_MAX}
              step={1}
              marks={CREATE_FUNCTION_MODAL_VCPUS_SLIDER_MARKS}
              value={vcpus}
              onChange={setVcpus}
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
              value={memoryMib}
              onChange={setMemoryMib}
              fillWidth
            />
          </Flex>
        </Flex>
      </Widget>
      <Widget header="Limits">
        <Grid columns={FUNCTION_LIMITS_COLUMNS} gap={12}>
          <DurationInput
            label="Timeout"
            value={timeoutMs}
            min={CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS}
            max={CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS}
            onChange={(ms) => setTimeoutMs(ms ?? CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS)}
            fillWidth
          />
          <NumberInput
            label="Max concurrency"
            labelTooltip="Invocations past it wait in the queue"
            value={maxConcurrency}
            min={1}
            step={1}
            precision={0}
            hasSteppers
            placeholder="No limit"
            onChange={setMaxConcurrency}
            fillWidth
          />
        </Grid>
      </Widget>
    </Flex>
  );
};

export default CreateFunctionModalResources;
