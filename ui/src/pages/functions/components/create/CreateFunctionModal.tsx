import { create } from "@bufbuild/protobuf";
import { match } from "ts-pattern";

import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { FlexDirection, FlexVariant } from "@galaxy-io/dls/layout/Flex";
import Modal, { ModalSize } from "@galaxy-io/dls/modal/Modal";
import { Orientation, Radius } from "@galaxy-io/dls/theme/enums";

import {
  type Function as AlchemyFunction,
  GetFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import CreateFunctionModalProvider, {
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import CreateFunctionModalFooter from "@/pages/functions/components/create/components/CreateFunctionModalFooter";
import CreateFunctionModalSidebar from "@/pages/functions/components/create/components/CreateFunctionModalSidebar";
import { CREATE_FUNCTION_MODAL_STEP_TO_PADDING_MAP } from "@/pages/functions/components/create/constants";
import CreateFunctionModalContract from "@/pages/functions/components/create/steps/CreateFunctionModalContract";
import CreateFunctionModalDetails from "@/pages/functions/components/create/steps/CreateFunctionModalDetails";
import CreateFunctionModalResources from "@/pages/functions/components/create/steps/CreateFunctionModalResources";
import CreateFunctionModalReview from "@/pages/functions/components/create/steps/CreateFunctionModalReview";
import CreateFunctionModalRuntime from "@/pages/functions/components/create/steps/CreateFunctionModalRuntime";
import { CreateFunctionModalStep } from "@/pages/functions/components/create/types";

import { useGetFunctionQuery } from "@/api/queries/functions";

interface CreateFunctionModalContentProps {
  fn?: AlchemyFunction;
  onClose: () => void;
}

const CreateFunctionModalContent = ({ fn, onClose }: CreateFunctionModalContentProps) => {
  const { step, isSubmitting } = useCreateFunctionModalState();

  const renderBody = () =>
    match(step)
      .with(CreateFunctionModalStep.DETAILS, () => <CreateFunctionModalDetails />)
      .with(CreateFunctionModalStep.RUNTIME, () => <CreateFunctionModalRuntime />)
      .with(CreateFunctionModalStep.CONTRACT, () => <CreateFunctionModalContract />)
      .with(CreateFunctionModalStep.RESOURCES, () => <CreateFunctionModalResources />)
      .with(CreateFunctionModalStep.REVIEW, () => <CreateFunctionModalReview />)
      .exhaustive();

  return (
    <Modal
      isOpen
      size={ModalSize.X_LARGE}
      header={fn ? `New version of ${fn.name}` : "New image"}
      isDismissable={!isSubmitting}
      footer={<CreateFunctionModalFooter onClose={onClose} />}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Flex
        height="100%"
        variant={FlexVariant.PRIMARY}
        hasBorder
        radius={Radius.LG}
        overflow="hidden"
      >
        <CreateFunctionModalSidebar />
        <Divider orientation={Orientation.VERTICAL} />
        <Flex
          direction={FlexDirection.COLUMN}
          variant={FlexVariant.BASE}
          height="100%"
          width="100%"
          minWidth={0}
          padding={CREATE_FUNCTION_MODAL_STEP_TO_PADDING_MAP[step]}
          overflow="auto"
        >
          {renderBody()}
        </Flex>
      </Flex>
    </Modal>
  );
};

interface CreateFunctionModalProps {
  functionId?: AlchemyFunction["id"];
  onClose: () => void;
}

const CreateFunctionModal = ({ functionId, onClose }: CreateFunctionModalProps) => {
  const { data: functionData } = useGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id: functionId ?? "", includeVersions: true }),
    options: { enabled: !!functionId },
  });
  const fn = functionData?.function;

  if (functionId && !fn) return null;

  return (
    <CreateFunctionModalProvider fn={fn}>
      <CreateFunctionModalContent fn={fn} onClose={onClose} />
    </CreateFunctionModalProvider>
  );
};

export default CreateFunctionModal;
