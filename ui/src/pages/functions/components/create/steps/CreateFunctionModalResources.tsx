import type { FC } from "react";

import DurationInput from "@galaxy-io/dls/inputs/DurationInput";
import SliderInput from "@galaxy-io/dls/inputs/SliderInput";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import { Radius } from "@galaxy-io/dls/theme/enums";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MARKS,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_STEP,
  CREATE_FUNCTION_MODAL_RESOURCES_MAX_WIDTH,
  CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS,
  CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS,
  CREATE_FUNCTION_MODAL_VCPUS_MARKS,
  CREATE_FUNCTION_MODAL_VCPUS_MAX,
  CREATE_FUNCTION_MODAL_VCPUS_MIN,
} from "@/pages/functions/components/create/constants";

import { formatMemory } from "@/utils/format";

const CREATE_FUNCTION_MODAL_VCPUS_SLIDER_MARKS = CREATE_FUNCTION_MODAL_VCPUS_MARKS.map((value) => ({
  value,
  label: String(value),
}));

const CREATE_FUNCTION_MODAL_MEMORY_SLIDER_MARKS = CREATE_FUNCTION_MODAL_MEMORY_MIB_MARKS.map(
  (value) => ({ value, label: formatMemory(value) }),
);

const CreateFunctionModalResources: FC = () => {
  const { vcpus, memoryMib, timeoutMs } = useCreateFunctionModalState();
  const { setVcpus, setMemoryMib, setTimeoutMs } = useCreateFunctionModalActions();

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
        <DurationInput
          label="Timeout"
          value={timeoutMs}
          min={CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS}
          max={CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS}
          onChange={(ms) => setTimeoutMs(ms ?? CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS)}
        />
      </Widget>
    </Flex>
  );
};

export default CreateFunctionModalResources;
