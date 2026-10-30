import type { FC } from "react";

import { IconVariant } from "@galaxy-io/dls/icons/Icon";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import FlexItem from "@galaxy-io/dls/layout/FlexItem";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import Widget, { WidgetVariant } from "@galaxy-io/dls/widget/Widget";

import IconTile from "@/components/IconTile";

import {
  CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_DESCRIPTION_MAP,
  CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_ICON_MAP,
} from "@/pages/functions/components/create/constants";
import { FUNCTION_SOURCE_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import type { FunctionSourceKind } from "@/pages/functions/types";

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
      isInteractive
      variant={isSelected ? WidgetVariant.SECONDARY : WidgetVariant.PRIMARY}
      isSelected={isSelected}
      onClick={onSelect}
      ariaLabel={FUNCTION_SOURCE_KIND_TO_LABEL_MAP[kind]}
      isFlush
    >
      <Flex alignItems={AlignItems.CENTER} gap={12} padding={[12, 16]} fillWidth>
        <IconTile
          icon={CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_ICON_MAP[kind]}
          variant={IconVariant.SECONDARY}
        />
        <Flex alignItems={AlignItems.START} direction={FlexDirection.COLUMN} gap={2} minWidth={0}>
          <Text>{FUNCTION_SOURCE_KIND_TO_LABEL_MAP[kind]}</Text>
          <Text size={TextSize.BODY_SM} variant={TextVariant.SECONDARY}>
            {CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_DESCRIPTION_MAP[kind]}
          </Text>
        </Flex>
      </Flex>
    </Widget>
  </FlexItem>
);

export default CreateFunctionModalSourceOption;
