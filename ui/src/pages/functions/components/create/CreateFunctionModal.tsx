import type { FC } from "react";

import { match } from "ts-pattern";

import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import PendingLayout from "@galaxy-io/dls/layout/PendingLayout";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import Modal from "@galaxy-io/dls/modal/Modal";

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
  type CreateFunctionModalFlowSeed,
  CreateFunctionModalMode,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import { getFunctionCurrentVersion } from "@/pages/functions/utils";

import type { AlchemyReturnSearch } from "@/module/paths";

import {
  createGetFunctionVersionInput,
  useGetFunctionVersionQuery,
} from "@/api/queries/function_versions";
import { createGetFunctionInput, useGetFunctionQuery } from "@/api/queries/functions";
import { useListRuntimesQuery } from "@/api/queries/runtimes";
import { useListTemplatesQuery } from "@/api/queries/templates";

import { useOverlaySession } from "@/hooks/useOverlaySession";

interface CreateFunctionModalContentProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: AlchemyReturnSearch) => void;
}

const CreateFunctionModalContent: FC<CreateFunctionModalContentProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
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
      isFullscreen
      header={CREATE_FUNCTION_MODAL_MODE_TO_HEADER_MAP[mode]}
      subheader={mode === CreateFunctionModalMode.VERSION ? name : undefined}
      isDismissable={!isSubmitting}
      sidebar={<CreateFunctionModalSidebar />}
      footer={<CreateFunctionModalFooter onCreated={onCreated} />}
      hasDividers
      isFlush
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Box variant={BoxVariant.BASE} height="100%">
        {renderBody()}
      </Box>
    </Modal>
  );
};

interface CreateFunctionModalProps {
  isOpen: boolean;
  functionId?: AlchemyFunction["id"];
  flowSeed: CreateFunctionModalFlowSeed;
  onClose: () => void;
  onCreated: (result: AlchemyReturnSearch) => void;
}

const CreateFunctionModal: FC<CreateFunctionModalProps> = ({
  isOpen,
  functionId,
  flowSeed,
  onClose,
  onCreated,
}) => {
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
  const { data: templatesData, isError: isTemplatesError } = useListTemplatesQuery({
    options: { enabled: !!session },
  });

  if (!session) {
    return null;
  }

  if (
    !runtimesData ||
    (!templatesData && !isTemplatesError) ||
    (functionId && (!alchemyFunction || !version))
  ) {
    return (
      <Modal
        isOpen={isOpen}
        isFullscreen
        header={
          CREATE_FUNCTION_MODAL_MODE_TO_HEADER_MAP[
            functionId ? CreateFunctionModalMode.VERSION : CreateFunctionModalMode.FUNCTION
          ]
        }
        hasDividers
        isFlush
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
      templates={templatesData?.templates ?? []}
      flowSeed={flowSeed}
    >
      <CreateFunctionModalContent isOpen={isOpen} onClose={onClose} onCreated={onCreated} />
    </CreateFunctionModalProvider>
  );
};

export default CreateFunctionModal;
