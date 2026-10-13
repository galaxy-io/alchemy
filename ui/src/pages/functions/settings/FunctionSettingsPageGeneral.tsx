import { useState } from "react";

import { create } from "@bufbuild/protobuf";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import TextAreaInput from "@galaxy-io/dls/inputs/TextAreaInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  GetFunctionRequestSchema,
  UpdateFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import { FUNCTION_SETTINGS_PAGE_DESCRIPTION_MIN_ROWS } from "@/pages/functions/settings/constants";
import type { FunctionSettingsPageGeneralState } from "@/pages/functions/settings/types";
import { getFunctionNameError } from "@/pages/functions/utils";

import { useSuspenseGetFunctionQuery, useUpdateFunctionMutation } from "@/api/queries/functions";

import { useFunctionParams } from "@/module/hooks";
import { getErrorMessage } from "@/utils/errors";

const DEFAULT_STATE: FunctionSettingsPageGeneralState = {
  name: "",
  description: "",
};

const FunctionSettingsPageGeneral = () => {
  const { toast } = useToast();
  const { id } = useFunctionParams();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const fn = data.function;

  const { mutate: updateFunction, isPending: isSaving } = useUpdateFunctionMutation();

  const createInitialState = (): FunctionSettingsPageGeneralState => ({
    ...DEFAULT_STATE,
    name: fn?.name ?? "",
    description: fn?.description ?? "",
  });

  const [state, setState] = useState<FunctionSettingsPageGeneralState>(createInitialState);

  if (!fn) return null;

  const nameError = getFunctionNameError(state.name.trim());
  const hasChanges = state.name.trim() !== fn.name || state.description.trim() !== fn.description;
  const canSave = hasChanges && nameError === undefined;

  const handleChange = (partial: Partial<FunctionSettingsPageGeneralState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  };

  const handleCancel = () => {
    setState(createInitialState());
  };

  const handleSave = () => {
    const name = state.name.trim();
    updateFunction(
      create(UpdateFunctionRequestSchema, {
        functionId: fn.id,
        name,
        description: state.description.trim(),
      }),
      {
        onSuccess: () => {
          toast({ header: "Function saved", description: `${name} updated.` });
        },
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

  return (
    <Widget header="General" isCollapsible defaultIsOpen>
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        <TextInput
          label="Name"
          labelTooltip="Callers invoke by id, so renaming is safe."
          value={state.name}
          onChange={(name) => handleChange({ name })}
          error={state.name !== fn.name ? nameError : undefined}
          fillWidth
        />
        <TextAreaInput
          label="Description"
          labelTooltip="Shown on the function card and in its heading."
          value={state.description}
          onChange={(description) => handleChange({ description })}
          minRows={FUNCTION_SETTINGS_PAGE_DESCRIPTION_MIN_ROWS}
          fillWidth
        />
        <Flex justifyContent={JustifyContent.END} gap={8}>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            isDisabled={!hasChanges || isSaving}
            onClick={handleCancel}
          />
          <Button label="Save" isDisabled={!canSave} isLoading={isSaving} onClick={handleSave} />
        </Flex>
      </Flex>
    </Widget>
  );
};

export default FunctionSettingsPageGeneral;
