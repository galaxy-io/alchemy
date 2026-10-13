import KeyValueInput from "@galaxy-io/dls/inputs/KeyValueInput";
import TagInput from "@galaxy-io/dls/inputs/TagInput";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";

const CreateFunctionModalRuntimeAdvanced = () => {
  const { command, env } = useCreateFunctionModalState();
  const { setCommand, setEnv } = useCreateFunctionModalActions();

  return (
    <Widget header="Advanced" isCollapsible defaultIsOpen={false}>
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        <TagInput
          label="Command"
          description="argv; empty uses the image's entrypoint."
          placeholder="python, handler.py..."
          value={command}
          onChange={setCommand}
          fillWidth
        />
        <KeyValueInput label="Environment" value={env} onChange={setEnv} fillWidth />
      </Flex>
    </Widget>
  );
};

export default CreateFunctionModalRuntimeAdvanced;
