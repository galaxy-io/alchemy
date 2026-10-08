import { TrashIcon } from "@phosphor-icons/react";

import Button, { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import SelectInput, { SelectInputSize } from "@galaxy-io/dls/inputs/SelectInput";
import SwitchInput, { SwitchInputSize } from "@galaxy-io/dls/inputs/SwitchInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import { useCreateFunctionModalActions } from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_ARROW_TYPE_WIDTH,
  CREATE_FUNCTION_MODAL_ARROW_TYPES,
  CREATE_FUNCTION_MODAL_DEFAULT_ARROW_TYPE,
} from "@/pages/functions/components/create/constants";
import type {
  CreateFunctionModalArrowField,
  CreateFunctionModalContractSide,
} from "@/pages/functions/components/create/types";

interface CreateFunctionModalContractArrowFieldProps {
  side: CreateFunctionModalContractSide;
  field: CreateFunctionModalArrowField;
}

const CreateFunctionModalContractArrowField = ({
  side,
  field,
}: CreateFunctionModalContractArrowFieldProps) => {
  const { updateArrowField, removeArrowField } = useCreateFunctionModalActions();

  return (
    <Flex gap={8} alignItems={AlignItems.CENTER}>
      <Flex grow={1} minWidth={0}>
        <TextInput
          ariaLabel="Field name"
          placeholder="field_name..."
          value={field.name}
          onChange={(name) => updateArrowField(side, field.id, { name })}
          family={FontFamily.MONO}
          fillWidth
        />
      </Flex>
      <Flex width={CREATE_FUNCTION_MODAL_ARROW_TYPE_WIDTH}>
        <SelectInput
          ariaLabel="Type"
          size={SelectInputSize.MEDIUM}
          options={[...new Set([...CREATE_FUNCTION_MODAL_ARROW_TYPES, field.type])].map((type) => ({
            id: type,
            label: type,
          }))}
          value={field.type}
          onChange={(type) =>
            updateArrowField(side, field.id, {
              type: type ?? CREATE_FUNCTION_MODAL_DEFAULT_ARROW_TYPE,
            })
          }
          fillWidth
        />
      </Flex>
      <SwitchInput
        ariaLabel="Nullable"
        label="Nullable"
        size={SwitchInputSize.SMALL}
        isChecked={field.nullable}
        onChange={(nullable) => updateArrowField(side, field.id, { nullable })}
      />
      <Button
        icon={TrashIcon}
        ariaLabel="Remove field"
        tooltip="Remove field"
        size={ButtonSize.SMALL}
        variant={ButtonVariant.TERTIARY}
        onClick={() => removeArrowField(side, field.id)}
      />
    </Flex>
  );
};

export default CreateFunctionModalContractArrowField;
