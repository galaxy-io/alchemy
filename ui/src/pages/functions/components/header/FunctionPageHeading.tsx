import { create } from "@bufbuild/protobuf";
import { styled } from "@linaria/react";

import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import EditableText from "@galaxy-io/dls/text/EditableText";
import { TextSize, TextWeight } from "@galaxy-io/dls/text/Text";
import { t } from "@galaxy-io/dls/theme/tokens/t";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";

import {
  GetFunctionRequestSchema,
  UpdateFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import FunctionPageVersionSelect from "@/pages/functions/components/header/FunctionPageVersionSelect";
import {
  FUNCTION_DESCRIPTION_MAX_LENGTH,
  FUNCTION_NAME_MAX_LENGTH,
} from "@/pages/functions/constants";
import { getFunctionNameError } from "@/pages/functions/utils";

import { useSuspenseGetFunctionQuery, useUpdateFunctionMutation } from "@/api/queries/functions";

import { useFunctionParams } from "@/module/hooks";
import { getErrorMessage } from "@/utils/errors";

// EditableText paints text.primary; the description reads one step quieter.
const MutedDescriptionWrapper = styled.span`
  display: inline-flex;
  min-width: 0;
  color: ${t.color.text.secondary};

  & [class*="gx-Text-PRIMARY"] {
    color: inherit;
  }
`;

const FunctionPageHeading = () => {
  const { toast } = useToast();
  const { id } = useFunctionParams();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const fn = data.function;

  const { mutate: updateFunction } = useUpdateFunctionMutation();

  if (!fn) return null;

  const handleRename = (name: string) => {
    const nextName = name.trim();
    if (nextName === fn.name) return;
    const nameError = getFunctionNameError(nextName);
    if (nameError) {
      toast({ header: "Rename failed", description: nameError });
      return;
    }
    updateFunction(
      create(UpdateFunctionRequestSchema, {
        functionId: fn.id,
        name: nextName,
        description: fn.description,
      }),
      {
        onSuccess: () => {
          toast({ header: "Function renamed" });
        },
        onError: (error) => {
          toast({
            header: "Rename failed",
            description: getErrorMessage(error, "Failed to rename function"),
            variant: ToastVariant.ERROR,
          });
        },
      },
    );
  };

  const handleDescriptionChange = (description: string) => {
    const nextDescription = description.trim();
    if (nextDescription === fn.description) return;
    updateFunction(
      create(UpdateFunctionRequestSchema, {
        functionId: fn.id,
        name: fn.name,
        description: nextDescription,
      }),
      {
        onSuccess: () => {
          toast({ header: "Description saved" });
        },
        onError: (error) => {
          toast({
            header: "Save failed",
            description: getErrorMessage(error, "Failed to save description"),
            variant: ToastVariant.ERROR,
          });
        },
      },
    );
  };

  return (
    <Flex gap={8} alignItems={AlignItems.CENTER} minWidth={0}>
      <EditableText
        ariaLabel="Function name"
        value={fn.name}
        onChange={handleRename}
        size={TextSize.HEADING_MD}
        weight={TextWeight.MEDIUM}
        maxLength={FUNCTION_NAME_MAX_LENGTH}
      />
      <FunctionPageVersionSelect />
      <Flex minWidth={0} padding={[0, 0, 0, 8]}>
        <MutedDescriptionWrapper>
          <EditableText
            ariaLabel="Function description"
            value={fn.description}
            placeholder="Add a description..."
            onChange={handleDescriptionChange}
            size={TextSize.BODY_MD}
            maxLength={FUNCTION_DESCRIPTION_MAX_LENGTH}
          />
        </MutedDescriptionWrapper>
      </Flex>
    </Flex>
  );
};

export default FunctionPageHeading;
