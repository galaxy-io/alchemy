import type { FC } from "react";

import { InfoIcon } from "@phosphor-icons/react";
import { match } from "ts-pattern";

import Icon, { IconVariant } from "@galaxy-io/dls/icons/Icon";
import KeyValueInput from "@galaxy-io/dls/inputs/KeyValueInput";
import SelectInput, { type SelectOption } from "@galaxy-io/dls/inputs/SelectInput";
import TagInput from "@galaxy-io/dls/inputs/TagInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import Widget, { WidgetVariant } from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_DETAILS_MAP,
  CREATE_FUNCTION_MODAL_SOURCE_TOOLTIP_MAX_WIDTH,
} from "@/pages/functions/components/create/constants";
import CreateFunctionModalSourceOption from "@/pages/functions/components/create/steps/components/CreateFunctionModalSourceOption";
import FunctionRuntimeIcon from "@/pages/functions/components/FunctionRuntimeIcon";
import {
  FUNCTION_SOURCE_KIND_TO_LABEL_MAP,
  FUNCTION_SOURCE_KINDS,
} from "@/pages/functions/constants";
import { FunctionSourceKind } from "@/pages/functions/types";

const CreateFunctionModalSource: FC = () => {
  const { sourceKind, image, runtimes, runtime, command, env } = useCreateFunctionModalState();
  const { setSourceKind, setImage, setRuntime, setCommand, setEnv } =
    useCreateFunctionModalActions();
  const runtimeOptions: SelectOption[] = runtimes.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    leading: <FunctionRuntimeIcon runtime={candidate} />,
  }));

  return (
    <Flex direction={FlexDirection.COLUMN} gap={12}>
      <Widget variant={WidgetVariant.PRIMARY}>
        <Flex alignItems={AlignItems.START} direction={FlexDirection.COLUMN} gap={12} fillWidth>
          <Flex alignItems={AlignItems.CENTER} gap={4}>
            <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM} variant={TextVariant.TERTIARY}>
              Source
            </Text>
            <Icon
              component={InfoIcon}
              variant={IconVariant.TERTIARY}
              size={14}
              ariaLabel="About sources"
              tooltip={
                <Flex
                  alignItems={AlignItems.START}
                  direction={FlexDirection.COLUMN}
                  gap={8}
                  maxWidth={CREATE_FUNCTION_MODAL_SOURCE_TOOLTIP_MAX_WIDTH}
                >
                  {FUNCTION_SOURCE_KINDS.map((kind) => (
                    <Flex
                      alignItems={AlignItems.START}
                      key={kind}
                      direction={FlexDirection.COLUMN}
                      gap={2}
                    >
                      <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM}>
                        {FUNCTION_SOURCE_KIND_TO_LABEL_MAP[kind]}
                      </Text>
                      <Text size={TextSize.BODY_SM} variant={TextVariant.SECONDARY}>
                        {CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_DETAILS_MAP[kind]}
                      </Text>
                    </Flex>
                  ))}
                </Flex>
              }
            />
          </Flex>
          <Flex alignItems={AlignItems.STRETCH} gap={12} fillWidth>
            {FUNCTION_SOURCE_KINDS.map((kind) => (
              <CreateFunctionModalSourceOption
                key={kind}
                kind={kind}
                isSelected={sourceKind === kind}
                onSelect={() => setSourceKind(kind)}
              />
            ))}
          </Flex>
        </Flex>
      </Widget>
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
      <Widget header="Advanced" isCollapsible defaultIsOpen={false}>
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

export default CreateFunctionModalSource;
