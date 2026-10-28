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
import CreateFunctionModalCode from "@/pages/functions/components/create/steps/CreateFunctionModalCode";
import CreateFunctionModalContract from "@/pages/functions/components/create/steps/CreateFunctionModalContract";
import CreateFunctionModalDetails from "@/pages/functions/components/create/steps/CreateFunctionModalDetails";
import CreateFunctionModalResources from "@/pages/functions/components/create/steps/CreateFunctionModalResources";
import CreateFunctionModalSource from "@/pages/functions/components/create/steps/CreateFunctionModalSource";
import {
  CreateFunctionModalMode,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import { getFunctionCurrentVersion } from "@/pages/functions/utils";

import {
  createGetFunctionVersionInput,
  useGetFunctionVersionQuery,
} from "@/api/queries/function_versions";
import { createGetFunctionInput, useGetFunctionQuery } from "@/api/queries/functions";
import { useListRuntimesQuery } from "@/api/queries/runtimes";

import { useOverlaySession } from "@/hooks/useOverlaySession";

interface CreateFunctionModalContentProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateFunctionModalContent: FC<CreateFunctionModalContentProps> = ({ isOpen, onClose }) => {
  const { mode, step, name, isSubmitting } = useCreateFunctionModalState();

  const renderBody = () => {
    const body = match(step)
      .with(CreateFunctionModalStep.SOURCE, () => <CreateFunctionModalSource />)
      .with(CreateFunctionModalStep.CONTRACT, () => <CreateFunctionModalContract />)
      .with(CreateFunctionModalStep.CODE, () => <CreateFunctionModalCode />)
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
  const seed = alchemyFunction
    ? (getFunctionCurrentVersion(alchemyFunction) ?? alchemyFunction.versions[0])
    : undefined;
  const hasSource = !!seed?.spec?.source;
  const { data: versionData } = useGetFunctionVersionQuery({
    input: createGetFunctionVersionInput(functionId ?? "", seed?.version ?? 0n),
    options: { enabled: !!session && hasSource },
  });
  const version = hasSource ? versionData?.version : seed;
  const { data: runtimesData } = useListRuntimesQuery({ options: { enabled: !!session } });

  if (!session) {
    return null;
  }

  if (!runtimesData || (functionId && (!alchemyFunction || !version))) {
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
    <CreateFunctionModalProvider
      key={session}
      alchemyFunction={alchemyFunction}
      version={version}
      runtimes={runtimesData.runtimes}
      limits={runtimesData.limits}
    >
      <CreateFunctionModalContent isOpen={isOpen} onClose={onClose} />
    </CreateFunctionModalProvider>
  );
};

export default CreateFunctionModal;
