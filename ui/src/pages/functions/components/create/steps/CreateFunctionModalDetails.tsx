import type { FC } from "react";

import TextAreaInput from "@galaxy-io/dls/inputs/TextAreaInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import { CREATE_FUNCTION_MODAL_DESCRIPTION_MIN_ROWS } from "@/pages/functions/components/create/constants";

const CreateFunctionModalDetails: FC = () => {
  const { name, description, isNameTouched, nameError } = useCreateFunctionModalState();
  const { setName, setDescription } = useCreateFunctionModalActions();

  return (
    <Flex
      alignItems={AlignItems.START}
      direction={FlexDirection.COLUMN}
      gap={16}
      fillWidth
      height="100%"
    >
      <TextInput
        value={name}
        onChange={setName}
        placeholder="Enter function name..."
        label="Name"
        isRequired
        error={isNameTouched ? nameError : undefined}
        fillWidth
        autoFocus
      />
      <TextAreaInput
        value={description}
        onChange={setDescription}
        placeholder="Enter an optional description..."
        label="Description"
        minRows={CREATE_FUNCTION_MODAL_DESCRIPTION_MIN_ROWS}
        isAutoGrow
        fillWidth
      />
    </Flex>
  );
};

export default CreateFunctionModalDetails;
