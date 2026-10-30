import type { FC } from "react";

import { InfoIcon } from "@phosphor-icons/react";

import Icon, { IconVariant } from "@galaxy-io/dls/icons/Icon";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
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
import {
  FUNCTION_SOURCE_KIND_TO_LABEL_MAP,
  FUNCTION_SOURCE_KINDS,
} from "@/pages/functions/constants";

const CreateFunctionModalSourceKind: FC = () => {
  const { sourceKind } = useCreateFunctionModalState();
  const { setSourceKind } = useCreateFunctionModalActions();

  return (
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
  );
};

export default CreateFunctionModalSourceKind;
