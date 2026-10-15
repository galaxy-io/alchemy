import type { FC } from "react";

import { match } from "ts-pattern";

import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { FlexDirection, FlexVariant } from "@galaxy-io/dls/layout/Flex";
import FlexItem from "@galaxy-io/dls/layout/FlexItem";
import PendingLayout from "@galaxy-io/dls/layout/PendingLayout";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import Modal, { ModalSize } from "@galaxy-io/dls/modal/Modal";
import { Orientation, Radius } from "@galaxy-io/dls/theme/enums";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import CreateFunctionModalProvider, {
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import CreateFunctionModalFooter from "@/pages/functions/components/create/components/CreateFunctionModalFooter";
import CreateFunctionModalSidebar from "@/pages/functions/components/create/components/CreateFunctionModalSidebar";
import {
  CREATE_FUNCTION_MODAL_MODE_TO_HEADER_MAP,
  CREATE_FUNCTION_MODAL_STEP_TO_IS_PADDED_MAP,
} from "@/pages/functions/components/create/constants";
import CreateFunctionModalContract from "@/pages/functions/components/create/steps/CreateFunctionModalContract";
import CreateFunctionModalDetails from "@/pages/functions/components/create/steps/CreateFunctionModalDetails";
import CreateFunctionModalResources from "@/pages/functions/components/create/steps/CreateFunctionModalResources";
import CreateFunctionModalRuntime from "@/pages/functions/components/create/steps/CreateFunctionModalRuntime";
import {
  CreateFunctionModalMode,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";

import { createGetFunctionInput, useGetFunctionQuery } from "@/api/queries/functions";

import { useOverlaySession } from "@/hooks/useOverlaySession";

interface CreateFunctionModalContentProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateFunctionModalContent: FC<CreateFunctionModalContentProps> = ({ isOpen, onClose }) => {
  const { mode, step, name, isSubmitting } = useCreateFunctionModalState();

  const renderBody = () => {
    const body = match(step)
      .with(CreateFunctionModalStep.RUNTIME, () => <CreateFunctionModalRuntime />)
      .with(CreateFunctionModalStep.CONTRACT, () => <CreateFunctionModalContract />)
      .with(CreateFunctionModalStep.RESOURCES, () => <CreateFunctionModalResources />)
      .with(CreateFunctionModalStep.DETAILS, () => <CreateFunctionModalDetails />)
      .exhaustive();

    if (CREATE_FUNCTION_MODAL_STEP_TO_IS_PADDED_MAP[step]) {
      return (
        <ScrollArea>
          <Box padding={16}>{body}</Box>
        </ScrollArea>
      );
    }

    return (
      <Flex direction={FlexDirection.COLUMN} height="100%">
        {body}
      </Flex>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      size={ModalSize.X_LARGE}
      header={CREATE_FUNCTION_MODAL_MODE_TO_HEADER_MAP[mode]}
      subheader={mode === CreateFunctionModalMode.VERSION ? name : undefined}
      isDismissable={!isSubmitting}
      footer={<CreateFunctionModalFooter onClose={onClose} />}
      onOpenChange={(open) => {
        if (!open) onClose();
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
        <FlexItem grow={1} basis={0} minWidth={0}>
          <Box variant={BoxVariant.BASE} height="100%">
            {renderBody()}
          </Box>
        </FlexItem>
      </Flex>
    </Modal>
  );
};

interface CreateFunctionModalProps {
  isOpen: boolean;
  functionId?: AlchemyFunction["id"];
  onClose: () => void;
}

const CreateFunctionModal: FC<CreateFunctionModalProps> = ({ isOpen, functionId, onClose }) => {
  const session = useOverlaySession(isOpen);

  const { data } = useGetFunctionQuery({
    input: createGetFunctionInput(functionId ?? ""),
    options: { enabled: !!session && !!functionId },
  });
  const alchemyFunction = data?.function;

  if (!session) {
    return null;
  }

  if (functionId && !alchemyFunction) {
    return (
      <Modal
        isOpen={isOpen}
        size={ModalSize.MEDIUM}
        header="New version"
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <PendingLayout />
      </Modal>
    );
  }

  return (
    <CreateFunctionModalProvider key={session} alchemyFunction={alchemyFunction}>
      <CreateFunctionModalContent isOpen={isOpen} onClose={onClose} />
    </CreateFunctionModalProvider>
  );
};

export default CreateFunctionModal;
