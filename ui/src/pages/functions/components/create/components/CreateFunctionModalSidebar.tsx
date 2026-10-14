import Flex, { FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import { LinkUnderline } from "@galaxy-io/dls/links/Link";
import Stepper, { StepperSize, type StepperStep } from "@galaxy-io/dls/navigation/Stepper";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
import { Orientation } from "@galaxy-io/dls/theme/enums";
import Widget, { WidgetVariant } from "@galaxy-io/dls/widget/Widget";

import DocsLink from "@/components/DocsLink";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_SIDEBAR_WIDTH,
  CREATE_FUNCTION_MODAL_STEP_TO_DESCRIPTION_MAP,
  CREATE_FUNCTION_MODAL_STEP_TO_TITLE_MAP,
} from "@/pages/functions/components/create/constants";
import { CreateFunctionModalStep } from "@/pages/functions/components/create/types";
import { getCreateFunctionModalStepSummary } from "@/pages/functions/components/create/utils";

const CreateFunctionModalSidebar = () => {
  const state = useCreateFunctionModalState();
  const { goToStep } = useCreateFunctionModalActions();
  const { steps, stepIndex, nameError } = state;

  const stepperSteps: StepperStep[] = steps.map((step, index) => ({
    label: CREATE_FUNCTION_MODAL_STEP_TO_TITLE_MAP[step],
    ...(index < stepIndex ? { description: getCreateFunctionModalStepSummary(state, step) } : {}),
    isError:
      index < stepIndex && step === CreateFunctionModalStep.DETAILS && nameError !== undefined,
  }));

  const handleStepChange = (index: number) => {
    const step = steps[index];
    if (step) goToStep(step);
  };

  return (
    <Flex
      direction={FlexDirection.COLUMN}
      justifyContent={JustifyContent.SPACE_BETWEEN}
      width={CREATE_FUNCTION_MODAL_SIDEBAR_WIDTH}
      padding={12}
      shrink={0}
    >
      <Widget variant={WidgetVariant.SECONDARY}>
        <Flex direction={FlexDirection.COLUMN} gap={12}>
          <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM} variant={TextVariant.TERTIARY}>
            Steps
          </Text>
          <Stepper
            ariaLabel="Create function"
            orientation={Orientation.VERTICAL}
            size={StepperSize.SMALL}
            steps={stepperSteps}
            value={stepIndex}
            onChange={handleStepChange}
          />
        </Flex>
      </Widget>
      <Flex direction={FlexDirection.COLUMN} gap={4}>
        <Text size={TextSize.BODY_SM} variant={TextVariant.TERTIARY} isProse>
          {CREATE_FUNCTION_MODAL_STEP_TO_DESCRIPTION_MAP[state.step]}
        </Text>
        <DocsLink label="Read the docs" size={TextSize.BODY_SM} underline={LinkUnderline.ALWAYS} />
      </Flex>
    </Flex>
  );
};

export default CreateFunctionModalSidebar;
