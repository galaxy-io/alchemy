import RadioGroup from "@galaxy-io/dls/inputs/RadioGroup";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Widget from "@galaxy-io/dls/widget/Widget";

import type { InvocationProtocol } from "@/gen/functions/v1/common_pb";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import { CREATE_FUNCTION_MODAL_PROTOCOLS } from "@/pages/functions/components/create/constants";
import CreateFunctionModalRuntimeAdvanced from "@/pages/functions/components/create/steps/components/CreateFunctionModalRuntimeAdvanced";
import CreateFunctionModalRuntimeImage from "@/pages/functions/components/create/steps/components/CreateFunctionModalRuntimeImage";
import {
  INVOCATION_PROTOCOL_TO_DESCRIPTION_MAP,
  INVOCATION_PROTOCOL_TO_LABEL_MAP,
} from "@/pages/functions/constants";

const CreateFunctionModalRuntime = () => {
  const { protocol } = useCreateFunctionModalState();
  const { setProtocol } = useCreateFunctionModalActions();

  return (
    <Flex direction={FlexDirection.COLUMN} gap={12}>
      <CreateFunctionModalRuntimeImage />
      <Widget header="Protocol">
        <RadioGroup
          ariaLabel="Protocol"
          options={CREATE_FUNCTION_MODAL_PROTOCOLS.map((option) => ({
            id: String(option),
            label: INVOCATION_PROTOCOL_TO_LABEL_MAP[option],
            description: INVOCATION_PROTOCOL_TO_DESCRIPTION_MAP[option],
          }))}
          value={String(protocol)}
          onChange={(id) => setProtocol(Number(id) as InvocationProtocol)}
        />
      </Widget>
      <CreateFunctionModalRuntimeAdvanced />
    </Flex>
  );
};

export default CreateFunctionModalRuntime;
