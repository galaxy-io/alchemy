import { styled } from "@linaria/react";

import TextAreaInput from "@galaxy-io/dls/inputs/TextAreaInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";

// DLS TextAreaInput has no fill-height mode; this lets the description take the step's slack.
const TextAreaFillWrapper = styled.div`
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;

  & div:has(textarea) {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
  }

  & textarea[class*="gx-TextAreaInput-Control"] {
    flex: 1 1 0;
    height: auto;
    min-height: 0;
  }
`;

const CreateFunctionModalDetails = () => {
  const { name, description, isNameTouched, nameError } = useCreateFunctionModalState();
  const { setName, setDescription } = useCreateFunctionModalActions();

  return (
    <Flex direction={FlexDirection.COLUMN} gap={16} grow={1} minHeight={0}>
      <TextInput
        label="Name"
        placeholder="enrich-company..."
        value={name}
        onChange={setName}
        family={FontFamily.MONO}
        error={isNameTouched ? nameError : undefined}
        isRequired
        autoFocus
        fillWidth
      />
      <TextAreaFillWrapper>
        <TextAreaInput
          label="Description"
          placeholder="Optional..."
          value={description}
          onChange={setDescription}
          minRows={4}
          fillWidth
        />
      </TextAreaFillWrapper>
    </Flex>
  );
};

export default CreateFunctionModalDetails;
