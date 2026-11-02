import type { FC } from "react";

import { match } from "ts-pattern";

import SelectInput, { type SelectOption } from "@galaxy-io/dls/inputs/SelectInput";
import TagInput from "@galaxy-io/dls/inputs/TagInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import CreateFunctionModalEnv from "@/pages/functions/components/create/steps/components/CreateFunctionModalEnv";
import CreateFunctionModalSourceKind from "@/pages/functions/components/create/steps/components/CreateFunctionModalSourceKind";
import FunctionRuntimeIcon from "@/pages/functions/components/FunctionRuntimeIcon";
import { FunctionSourceKind } from "@/pages/functions/types";

const CreateFunctionModalSource: FC = () => {
  const { sourceKind, image, runtimes, runtime, command } = useCreateFunctionModalState();
  const { setImage, setRuntime, setCommand } = useCreateFunctionModalActions();
  const runtimeOptions: SelectOption[] = runtimes.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    leading: <FunctionRuntimeIcon runtime={candidate} />,
  }));

  return (
    <Flex direction={FlexDirection.COLUMN} gap={12}>
      <CreateFunctionModalSourceKind />
      {match(sourceKind)
        .with(FunctionSourceKind.SOURCE, () => (
          <Widget header="Runtime">
            <SelectInput
              label="Language"
              options={runtimeOptions}
              value={runtime}
              onChange={(value) => {
                if (value) setRuntime(value);
              }}
              fillWidth
            />
          </Widget>
        ))
        .with(FunctionSourceKind.IMAGE, () => (
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
        ))
        .exhaustive()}
      <CreateFunctionModalEnv />
      <Widget header="Advanced" isCollapsible defaultIsOpen={false}>
        <TagInput
          label="Command"
          labelTooltip="Empty uses the image's entrypoint"
          placeholder="python, handler.py..."
          value={command}
          onChange={setCommand}
          fillWidth
        />
      </Widget>
    </Flex>
  );
};

export default CreateFunctionModalSource;
