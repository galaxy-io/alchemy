import { ArrowLeftIcon, ArrowRightIcon, WarningIcon } from "@phosphor-icons/react";
import { match } from "ts-pattern";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import Flex, { JustifyContent } from "@galaxy-io/dls/layout/Flex";
import BulletedList from "@galaxy-io/dls/lists/BulletedList";
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
import { formatFunctionVersion } from "@/pages/functions/utils";

import { useCreateFunctionVersionMutation } from "@/api/queries/function_versions";
import { useCreateFunctionMutation } from "@/api/queries/functions";

import { useAlchemyNavigate } from "@/module/hooks";
import { getErrorMessage } from "@/utils/errors";

interface CreateFunctionModalFooterProps {
  onClose: () => void;
}

const CreateFunctionModalFooter = ({ onClose }: CreateFunctionModalFooterProps) => {
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
    void navigate({ to: "./images/$id/versions", params: { id }, search: { version } });
  };

  const handleError = (error: unknown) => {
    setSubmitting(false);
    toast({
      header: "Create failed",
      description: getErrorMessage(error, "Could not create the function."),
    });
  };

  const handleCreateFunction = () => {
    if (!spec) return;
    setSubmitting(true);
    createFunction(mapCreateFunctionModalStateToRequest(state, spec), {
      onSuccess: ({ function: fn, version }) => {
        if (!fn) return;
        toast({
          header: "Function created",
          description: `${fn.name} is building v1. It becomes invokable when the build is ready.`,
        });
        handleCreated(fn.id, version?.version ?? 1n);
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
          header: "Version created",
          description: `${formatFunctionVersion(version.version)} is building.`,
        });
        handleCreated(functionId, version.version);
      },
      onError: handleError,
    });
  };

  const renderAction = () => {
    if (!isLastStep) {
      return (
        <Button
          label="Next"
          icon={ArrowRightIcon}
          isIconTrailing
          isDisabled={isNextDisabled}
          onClick={goNext}
        />
      );
    }
    return (
      <Button
        label={isSubmitting ? "Creating..." : CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_LABEL_MAP[mode]}
        icon={CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_ICON_MAP[mode]}
        isLoading={isSubmitting}
        isDisabled={spec === null}
        onClick={match(mode)
          .with(CreateFunctionModalMode.FUNCTION, () => handleCreateFunction)
          .with(CreateFunctionModalMode.VERSION, () => handleCreateVersion)
          .exhaustive()}
      />
    );
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
        {renderAction()}
      </Flex>
    </Flex>
  );
};

export default CreateFunctionModalFooter;
