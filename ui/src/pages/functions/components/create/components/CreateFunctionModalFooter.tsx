import type { FC } from "react";

import { ArrowLeftIcon, ArrowRightIcon, WarningIcon } from "@phosphor-icons/react";
import { match } from "ts-pattern";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import Flex, { JustifyContent } from "@galaxy-io/dls/layout/Flex";
import BulletedList from "@galaxy-io/dls/lists/BulletedList";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_ICON_MAP,
  CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_LABEL_MAP,
} from "@/pages/functions/components/create/constants";
import {
  mapCreateFunctionModalStateToRequest,
  mapCreateFunctionModalStateToVersionRequest,
} from "@/pages/functions/components/create/serialize";
import { CreateFunctionModalMode } from "@/pages/functions/components/create/types";

import { useAlchemyNavigate } from "@/module/hooks";
import { AlchemyPath } from "@/module/paths";

import { useCreateFunctionVersionMutation } from "@/api/queries/function_versions";
import { useCreateFunctionMutation } from "@/api/queries/functions";

import { getErrorMessage } from "@/utils/errors";
import { formatVersion } from "@/utils/format";

interface CreateFunctionModalFooterProps {
  onClose: () => void;
}

const CreateFunctionModalFooter: FC<CreateFunctionModalFooterProps> = ({ onClose }) => {
  const navigate = useAlchemyNavigate();
  const { toast } = useToast();
  const state = useCreateFunctionModalState();
  const { goBack, goNext, setSubmitting } = useCreateFunctionModalActions();
  const { mutate: createFunction } = useCreateFunctionMutation();
  const { mutate: createFunctionVersion } = useCreateFunctionVersionMutation();
  const { mode, spec, functionId, hints, isFirstStep, isLastStep, isNextDisabled, isSubmitting } =
    state;

  const handleCreated = (id: AlchemyFunction["id"], version: bigint) => {
    onClose();
    void navigate({ to: AlchemyPath.FUNCTION_VERSIONS, params: { id }, search: { version } });
  };

  const handleError = (error: unknown) => {
    setSubmitting(false);
    toast({
      header: "Create failed",
      description: getErrorMessage(error, "Failed to create image"),
      variant: ToastVariant.ERROR,
    });
  };

  const handleCreateFunction = () => {
    if (!spec) return;
    setSubmitting(true);
    createFunction(mapCreateFunctionModalStateToRequest(state, spec), {
      onSuccess: ({ function: created, version }) => {
        if (!created) return;
        toast({ header: "Image created", variant: ToastVariant.SUCCESS });
        handleCreated(created.id, version?.version ?? 1n);
      },
      onError: handleError,
    });
  };

  const handleCreateVersion = () => {
    if (!spec || !functionId) return;
    setSubmitting(true);
    createFunctionVersion(mapCreateFunctionModalStateToVersionRequest(functionId, spec), {
      onSuccess: ({ version }) => {
        if (!version) return;
        toast({
          header: `${formatVersion(version.version)} building`,
          variant: ToastVariant.SUCCESS,
        });
        handleCreated(functionId, version.version);
      },
      onError: handleError,
    });
  };

  return (
    <Flex justifyContent={JustifyContent.SPACE_BETWEEN} fillWidth>
      <Button
        label="Back"
        icon={ArrowLeftIcon}
        variant={ButtonVariant.SECONDARY}
        isDisabled={isFirstStep || isSubmitting}
        onClick={goBack}
      />
      <Flex gap={12}>
        {hints.length > 0 && (
          <Chip
            label="Invalid"
            icon={WarningIcon}
            variant={ChipVariant.ERROR}
            size={ChipSize.LARGE}
            tooltip={hints.length === 1 ? hints[0] : <BulletedList items={hints} />}
          />
        )}
        {isLastStep ? (
          <Button
            label={CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_LABEL_MAP[mode]}
            icon={CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_ICON_MAP[mode]}
            isLoading={isSubmitting}
            isDisabled={isNextDisabled || !spec}
            onClick={match(mode)
              .with(CreateFunctionModalMode.FUNCTION, () => handleCreateFunction)
              .with(CreateFunctionModalMode.VERSION, () => handleCreateVersion)
              .exhaustive()}
          />
        ) : (
          <Button
            label="Next"
            icon={ArrowRightIcon}
            isIconTrailing
            isDisabled={isNextDisabled}
            onClick={goNext}
          />
        )}
      </Flex>
    </Flex>
  );
};

export default CreateFunctionModalFooter;
