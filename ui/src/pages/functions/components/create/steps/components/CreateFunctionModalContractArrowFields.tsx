import { PlusIcon } from "@phosphor-icons/react";

import Button, { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import FunctionContractIsland from "@/pages/functions/components/contract/FunctionContractIsland";
import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import { CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP } from "@/pages/functions/components/create/constants";
import CreateFunctionModalContractArrowField from "@/pages/functions/components/create/steps/components/CreateFunctionModalContractArrowField";
import type { CreateFunctionModalContractSide } from "@/pages/functions/components/create/types";
import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";

interface CreateFunctionModalContractArrowFieldsProps {
  side: CreateFunctionModalContractSide;
}

const CreateFunctionModalContractArrowFields = ({
  side,
}: CreateFunctionModalContractArrowFieldsProps) => {
  const { arrowFields } = useCreateFunctionModalState();
  const { addArrowField } = useCreateFunctionModalActions();

  return (
    <FunctionContractIsland
      label={CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP[side]}
      caption={FUNCTION_CONTRACT_KIND_TO_LABEL_MAP.arrow}
      actions={
        <Button
          label="Add field"
          icon={PlusIcon}
          size={ButtonSize.X_SMALL}
          variant={ButtonVariant.TERTIARY}
          onClick={() => addArrowField(side)}
        />
      }
    >
      <Flex direction={FlexDirection.COLUMN} gap={8} padding={12} overflow="auto">
        {arrowFields[side].map((field) => (
          <CreateFunctionModalContractArrowField key={field.id} side={side} field={field} />
        ))}
      </Flex>
    </FunctionContractIsland>
  );
};

export default CreateFunctionModalContractArrowFields;
