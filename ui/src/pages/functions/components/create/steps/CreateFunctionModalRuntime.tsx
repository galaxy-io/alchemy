import type { FC } from "react";

import KeyValueInput from "@galaxy-io/dls/inputs/KeyValueInput";
import TagInput from "@galaxy-io/dls/inputs/TagInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";

const CreateFunctionModalRuntime: FC = () => {
  const { image, command, env } = useCreateFunctionModalState();
  const { setImage, setCommand, setEnv } = useCreateFunctionModalActions();

  return (
    <Flex direction={FlexDirection.COLUMN} gap={12}>
      <Widget header="Image">
        <TextInput
          label="Image reference"
          placeholder="ghcr.io/acme/enrich-company:1.4.0..."
          value={image}
          onChange={setImage}
          family={FontFamily.MONO}
          isRequired
          fillWidth
        />
      </Widget>
      <Widget header="Advanced" isCollapsible defaultIsOpen>
        <Flex direction={FlexDirection.COLUMN} gap={12}>
          <TagInput
            label="Command"
            labelTooltip="Empty uses the image's entrypoint"
            placeholder="python, handler.py..."
            value={command}
            onChange={setCommand}
            fillWidth
          />
          <KeyValueInput label="Environment" value={env} onChange={setEnv} fillWidth />
        </Flex>
      </Widget>
    </Flex>
  );
};

export default CreateFunctionModalRuntime;
