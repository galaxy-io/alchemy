import type { FC } from "react";

import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
import Widget, { WidgetVariant } from "@galaxy-io/dls/widget/Widget";

import type { Runtime } from "@/gen/functions/v1/functions_pb";
import type { Template } from "@/gen/functions/v1/templates_pb";

import IconTile from "@/components/IconTile";

import {
  CREATE_FUNCTION_MODAL_TEMPLATE_CARD_HEIGHT,
  CREATE_FUNCTION_MODAL_TEMPLATE_TILE_SIZE,
} from "@/pages/functions/components/create/constants";
import CreateFunctionModalTemplateLockup from "@/pages/functions/components/create/steps/components/CreateFunctionModalTemplateLockup";
import FunctionRuntimeIcon from "@/pages/functions/components/FunctionRuntimeIcon";

interface CreateFunctionModalTemplateOptionProps {
  template: Template;
  runtime: Runtime | undefined;
  isSelected: boolean;
  onSelect: () => void;
}

const CreateFunctionModalTemplateOption: FC<CreateFunctionModalTemplateOptionProps> = ({
  template,
  runtime,
  isSelected,
  onSelect,
}) => {
  const content = (
    <Flex
      alignItems={AlignItems.STRETCH}
      direction={FlexDirection.COLUMN}
      justifyContent={JustifyContent.SPACE_BETWEEN}
      gap={12}
      height={CREATE_FUNCTION_MODAL_TEMPLATE_CARD_HEIGHT}
    >
      {runtime && (
        <IconTile size={CREATE_FUNCTION_MODAL_TEMPLATE_TILE_SIZE}>
          <FunctionRuntimeIcon
            runtime={runtime}
            size={CREATE_FUNCTION_MODAL_TEMPLATE_TILE_SIZE / 2}
          />
        </IconTile>
      )}
      <Flex alignItems={AlignItems.START} direction={FlexDirection.COLUMN} gap={4} minWidth={0}>
        <Flex alignItems={AlignItems.CENTER} gap={8} minWidth={0}>
          <Text size={TextSize.BODY_LG} weight={TextWeight.MEDIUM} lineClamp={1}>
            {template.label}
          </Text>
          <Text size={TextSize.BODY_SM} variant={TextVariant.TERTIARY}>
            via
          </Text>
          <CreateFunctionModalTemplateLockup template={template} />
        </Flex>
        <Text size={TextSize.BODY_SM} variant={TextVariant.SECONDARY} lineClamp={3}>
          {template.description}
        </Text>
      </Flex>
    </Flex>
  );

  return (
    <Widget
      isInteractive
      isSelected={isSelected}
      variant={isSelected ? WidgetVariant.SECONDARY : WidgetVariant.PRIMARY}
      onClick={onSelect}
      ariaLabel={template.label}
    >
      {content}
    </Widget>
  );
};

export default CreateFunctionModalTemplateOption;
