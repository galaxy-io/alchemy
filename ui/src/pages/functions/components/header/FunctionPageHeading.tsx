import type { FC } from "react";

import { create } from "@bufbuild/protobuf";
import { ArrowLeftIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import EditableText from "@galaxy-io/dls/text/EditableText";
import { TextSize, TextWeight } from "@galaxy-io/dls/text/Text";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";

import {
  type Function as AlchemyFunction,
  type UpdateFunctionRequest,
  UpdateFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import RouterLink from "@/components/RouterLink";

import FunctionRuntimeIcon from "@/pages/functions/components/FunctionRuntimeIcon";
import FunctionPageVersionSelect from "@/pages/functions/components/header/FunctionPageVersionSelect";
import {
  FUNCTION_DESCRIPTION_MAX_LENGTH,
  FUNCTION_NAME_MAX_LENGTH,
} from "@/pages/functions/constants";
import {
  getFunctionCurrentVersion,
  getFunctionNameError,
  getFunctionVersionRuntime,
} from "@/pages/functions/utils";

import { AlchemyPath, createAlchemyHref } from "@/module/paths";

import { useUpdateFunctionMutation } from "@/api/queries/functions";
import { useListRuntimesQuery } from "@/api/queries/runtimes";

import { getErrorMessage } from "@/utils/errors";

interface FunctionPageHeadingProps {
  alchemyFunction: AlchemyFunction;
}

const FunctionPageHeading: FC<FunctionPageHeadingProps> = ({ alchemyFunction }) => {
  const { toast } = useToast();
  const { mutate: updateFunction } = useUpdateFunctionMutation();
  const { data: runtimesData } = useListRuntimesQuery();
  const runtime = getFunctionVersionRuntime(
    runtimesData?.runtimes ?? [],
    getFunctionCurrentVersion(alchemyFunction),
  );

  const handleUpdate = (patch: Pick<UpdateFunctionRequest, "name" | "description">) => {
    updateFunction(
      create(UpdateFunctionRequestSchema, { functionId: alchemyFunction.id, ...patch }),
      {
        onError: (error) => {
          toast({
            header: "Save failed",
            description: getErrorMessage(error, "Failed to save function"),
            variant: ToastVariant.ERROR,
          });
        },
      },
    );
  };

  const handleRename = (value: string) => {
    const name = value.trim();
    if (name === alchemyFunction.name) return;
    const nameError = getFunctionNameError(name);
    if (nameError) {
      toast({ header: "Rename failed", description: nameError, variant: ToastVariant.ERROR });
      return;
    }
    handleUpdate({ name, description: alchemyFunction.description });
  };

  const handleDescriptionChange = (value: string) => {
    const description = value.trim();
    if (description === alchemyFunction.description) return;
    handleUpdate({ name: alchemyFunction.name, description });
  };

  return (
    <Flex gap={8} alignItems={AlignItems.CENTER} minWidth={0}>
      <Button
        icon={ArrowLeftIcon}
        variant={ButtonVariant.TERTIARY}
        ariaLabel="All functions"
        tooltip="All functions"
        href={createAlchemyHref(AlchemyPath.FUNCTIONS)}
        as={RouterLink}
      />
      {runtime ? <FunctionRuntimeIcon runtime={runtime} /> : null}
      <EditableText
        ariaLabel="Function name"
        value={alchemyFunction.name}
        onChange={handleRename}
        size={TextSize.HEADING_MD}
        weight={TextWeight.MEDIUM}
        maxLength={FUNCTION_NAME_MAX_LENGTH}
      />
      <FunctionPageVersionSelect alchemyFunction={alchemyFunction} />
      <Flex minWidth={0} padding={[0, 0, 0, 8]}>
        <EditableText
          ariaLabel="Function description"
          value={alchemyFunction.description}
          placeholder="Add a description..."
          onChange={handleDescriptionChange}
          maxLength={FUNCTION_DESCRIPTION_MAX_LENGTH}
        />
      </Flex>
    </Flex>
  );
};

export default FunctionPageHeading;
