import { type FC, useState } from "react";

import { create } from "@bufbuild/protobuf";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import CopyInput from "@galaxy-io/dls/inputs/CopyInput";
import TextAreaInput from "@galaxy-io/dls/inputs/TextAreaInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  type Function as AlchemyFunction,
  UpdateFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import { FUNCTION_SETTINGS_PAGE_DESCRIPTION_MIN_ROWS } from "@/pages/functions/settings/constants";
import { getFunctionNameError } from "@/pages/functions/utils";

import { useUpdateFunctionMutation } from "@/api/queries/functions";

import { getErrorMessage } from "@/utils/errors";

interface FunctionSettingsPageGeneralState {
  name: AlchemyFunction["name"];
  description: AlchemyFunction["description"];
}

const DEFAULT_STATE: FunctionSettingsPageGeneralState = {
  name: "",
  description: "",
};

interface FunctionSettingsPageGeneralProps {
  alchemyFunction: AlchemyFunction;
}

const FunctionSettingsPageGeneral: FC<FunctionSettingsPageGeneralProps> = ({ alchemyFunction }) => {
  const { toast } = useToast();
  const { mutate: updateFunction, isPending: isSaving } = useUpdateFunctionMutation();

  const createInitialState = (): FunctionSettingsPageGeneralState => ({
    ...DEFAULT_STATE,
    name: alchemyFunction.name,
    description: alchemyFunction.description,
  });

  const [state, setState] = useState<FunctionSettingsPageGeneralState>(createInitialState);

  const name = state.name.trim();
  const nameError = getFunctionNameError(name);
  const hasChanges =
    name !== alchemyFunction.name || state.description.trim() !== alchemyFunction.description;
  const canSave = hasChanges && !nameError;

  const handleChange = (patch: Partial<FunctionSettingsPageGeneralState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = () => {
    updateFunction(
      create(UpdateFunctionRequestSchema, {
        functionId: alchemyFunction.id,
        name,
        description: state.description.trim(),
      }),
      {
        onSuccess: () => {
          toast({ header: "Image saved", variant: ToastVariant.SUCCESS });
        },
        onError: (error) => {
          toast({
            header: "Save failed",
            description: getErrorMessage(error, "Failed to save image"),
            variant: ToastVariant.ERROR,
          });
        },
      },
    );
  };

  return (
    <Widget header="General" isCollapsible defaultIsOpen>
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        <CopyInput value={alchemyFunction.id} label="ID" family={FontFamily.MONO} fillWidth />
        <TextInput
          label="Name"
          labelTooltip="Callers invoke by id, so renaming is safe"
          value={state.name}
          onChange={(value) => handleChange({ name: value })}
          error={name !== alchemyFunction.name ? nameError : undefined}
          fillWidth
        />
        <TextAreaInput
          label="Description"
          value={state.description}
          onChange={(description) => handleChange({ description })}
          minRows={FUNCTION_SETTINGS_PAGE_DESCRIPTION_MIN_ROWS}
          placeholder="Add a description..."
          fillWidth
        />
        <Flex justifyContent={JustifyContent.END} gap={8}>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            isDisabled={!hasChanges || isSaving}
            onClick={() => setState(createInitialState())}
          />
          <Button label="Save" isDisabled={!canSave} isLoading={isSaving} onClick={handleSave} />
        </Flex>
      </Flex>
    </Widget>
  );
};

export default FunctionSettingsPageGeneral;
