import type { FC } from "react";

import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import FlexItem from "@galaxy-io/dls/layout/FlexItem";
import Stepper, { StepperSize, type StepperStep } from "@galaxy-io/dls/navigation/Stepper";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
import { Orientation } from "@galaxy-io/dls/theme/enums";
import Widget, { WidgetVariant } from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_SIDEBAR_WIDTH,
  CREATE_FUNCTION_MODAL_STEP_TO_DESCRIPTION_MAP,
  CREATE_FUNCTION_MODAL_STEP_TO_TITLE_MAP,
} from "@/pages/functions/components/create/constants";
import { getCreateFunctionModalStepSummary } from "@/pages/functions/components/create/utils";

const CreateFunctionModalSidebar: FC = () => {
  const state = useCreateFunctionModalState();
  const { goToStep } = useCreateFunctionModalActions();
  const { step, steps, stepIndex, isSubmitting } = state;

  const stepperSteps: StepperStep[] = steps.map((item, index) => ({
    label: CREATE_FUNCTION_MODAL_STEP_TO_TITLE_MAP[item],
    description: index < stepIndex ? getCreateFunctionModalStepSummary(state, item) : undefined,
  }));

  const handleStepChange = (index: number) => {
    const item = steps[index];
    if (item) goToStep(item);
  };

  return (
    <FlexItem shrink={0}>
      <Box variant={BoxVariant.PRIMARY} width={CREATE_FUNCTION_MODAL_SIDEBAR_WIDTH} height="100%">
        <Flex
          direction={FlexDirection.COLUMN}
          justifyContent={JustifyContent.SPACE_BETWEEN}
          height="100%"
        >
          <Flex
            alignItems={AlignItems.STRETCH}
            direction={FlexDirection.COLUMN}
            padding={12}
            fillWidth
          >
            <Widget variant={WidgetVariant.SECONDARY}>
              <Flex alignItems={AlignItems.STRETCH} direction={FlexDirection.COLUMN} gap={12}>
                <Text
                  size={TextSize.BODY_SM}
                  weight={TextWeight.MEDIUM}
                  variant={TextVariant.TERTIARY}
                >
                  Steps
                </Text>
                <Stepper
                  steps={stepperSteps}
                  value={stepIndex}
                  onChange={isSubmitting ? undefined : handleStepChange}
                  orientation={Orientation.VERTICAL}
                  size={StepperSize.SMALL}
                  ariaLabel="Image setup"
                />
              </Flex>
            </Widget>
          </Flex>
          <Flex
            alignItems={AlignItems.START}
            direction={FlexDirection.COLUMN}
            gap={12}
            padding={16}
            fillWidth
          >
            <Text isProse weight={TextWeight.REGULAR} variant={TextVariant.TERTIARY}>
              {CREATE_FUNCTION_MODAL_STEP_TO_DESCRIPTION_MAP[step]}
            </Text>
          </Flex>
        </Flex>
      </Box>
    </FlexItem>
  );
};

export default CreateFunctionModalSidebar;
