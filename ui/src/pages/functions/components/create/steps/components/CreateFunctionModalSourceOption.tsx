import type { FC } from "react";

import { styled } from "@linaria/react";

import { IconVariant } from "@galaxy-io/dls/icons/Icon";
import RadioInput from "@galaxy-io/dls/inputs/RadioInput";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import FlexItem from "@galaxy-io/dls/layout/FlexItem";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { t } from "@galaxy-io/dls/theme/tokens/t";
import Widget, { WidgetVariant } from "@galaxy-io/dls/widget/Widget";

import IconTile from "@/components/IconTile";

import {
  CREATE_FUNCTION_MODAL_SOURCE_KIND_NAME,
  CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_DESCRIPTION_MAP,
  CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_ICON_MAP,
} from "@/pages/functions/components/create/constants";
import { FUNCTION_SOURCE_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import type { FunctionSourceKind } from "@/pages/functions/types";

const CreateFunctionModalSourceOptionTarget = styled.div`
  display: flex;
  align-items: center;
  gap: ${t.space[12]};
  min-width: 0;
  padding: ${t.space[12]} ${t.space[16]};
  cursor: pointer;
`;

interface CreateFunctionModalSourceOptionProps {
  kind: FunctionSourceKind;
  isSelected: boolean;
  onSelect: () => void;
}

const CreateFunctionModalSourceOption: FC<CreateFunctionModalSourceOptionProps> = ({
  kind,
  isSelected,
  onSelect,
}) => (
  <FlexItem grow={1} basis={0} minWidth={0}>
    <Widget
      variant={isSelected ? WidgetVariant.SECONDARY : WidgetVariant.PRIMARY}
      isSelected={isSelected}
      isFlush
    >
      <CreateFunctionModalSourceOptionTarget onClick={onSelect}>
        <RadioInput
          name={CREATE_FUNCTION_MODAL_SOURCE_KIND_NAME}
          isSelected={isSelected}
          onChange={onSelect}
          ariaLabel={FUNCTION_SOURCE_KIND_TO_LABEL_MAP[kind]}
        />
        <IconTile
          icon={CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_ICON_MAP[kind]}
          variant={IconVariant.SECONDARY}
        />
        <FlexItem grow={1} minWidth={0}>
          <Flex alignItems={AlignItems.START} direction={FlexDirection.COLUMN} gap={2}>
            <Text>{FUNCTION_SOURCE_KIND_TO_LABEL_MAP[kind]}</Text>
            <Text size={TextSize.BODY_SM} variant={TextVariant.SECONDARY}>
              {CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_DESCRIPTION_MAP[kind]}
            </Text>
          </Flex>
        </FlexItem>
      </CreateFunctionModalSourceOptionTarget>
    </Widget>
  </FlexItem>
);

export default CreateFunctionModalSourceOption;
