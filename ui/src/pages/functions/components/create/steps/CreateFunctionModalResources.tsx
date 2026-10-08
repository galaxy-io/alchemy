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
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_SLIDER_MAX,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_STEP,
  CREATE_FUNCTION_MODAL_RESOURCES_MAX_WIDTH,
  CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS,
  CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS,
  CREATE_FUNCTION_MODAL_VCPUS_MARKS,
  CREATE_FUNCTION_MODAL_VCPUS_MIN,
  CREATE_FUNCTION_MODAL_VCPUS_SLIDER_MAX,
} from "@/pages/functions/components/create/constants";

const formatMemoryMark = (mib: number) => (mib >= 1024 ? `${mib / 1024}G` : `${mib}M`);

const CreateFunctionModalResources = () => {
  const { vcpus, memoryMib, timeoutMs } = useCreateFunctionModalState();
  const { setVcpus, setMemoryMib, setTimeoutMs } = useCreateFunctionModalActions();

  return (
    <Flex
      direction={FlexDirection.COLUMN}
      gap={12}
      maxWidth={CREATE_FUNCTION_MODAL_RESOURCES_MAX_WIDTH}
    >
      <Widget header="MicroVM">
        <Flex hasBorder radius={Radius.LG} padding={12}>
          <SliderInput
            label="vCPUs"
            min={CREATE_FUNCTION_MODAL_VCPUS_MIN}
            max={CREATE_FUNCTION_MODAL_VCPUS_SLIDER_MAX}
            step={1}
            marks={CREATE_FUNCTION_MODAL_VCPUS_MARKS.map((value) => ({
              value,
              label: String(value),
            }))}
            value={vcpus}
            onChange={setVcpus}
            fillWidth
          />
        </Flex>
        <Flex hasBorder radius={Radius.LG} padding={12}>
          <SliderInput
            label="Memory"
            min={CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN}
            max={CREATE_FUNCTION_MODAL_MEMORY_MIB_SLIDER_MAX}
            step={CREATE_FUNCTION_MODAL_MEMORY_MIB_STEP}
            marks={CREATE_FUNCTION_MODAL_MEMORY_MIB_MARKS.map((value) => ({
              value,
              label: formatMemoryMark(value),
            }))}
            formatValue={(value) => `${value} MiB`}
            value={memoryMib}
            onChange={setMemoryMib}
            fillWidth
          />
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
