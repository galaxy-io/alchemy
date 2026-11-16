import type { FC } from "react";

import { match } from "ts-pattern";

import Alert from "@galaxy-io/dls/feedback/Alert";
import ToggleInput, { ToggleInputSize, type ToggleOption } from "@galaxy-io/dls/inputs/ToggleInput";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import FunctionContractCanvas from "@/pages/functions/components/contract/FunctionContractCanvas";
import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_CONTRACT_KINDS,
  CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP,
} from "@/pages/functions/components/create/constants";
import { mapCreateFunctionModalStateToContract } from "@/pages/functions/components/create/serialize";
import CreateFunctionModalContractArrowFields from "@/pages/functions/components/create/steps/components/CreateFunctionModalContractArrowFields";
import CreateFunctionModalContractSchemaEditor from "@/pages/functions/components/create/steps/components/CreateFunctionModalContractSchemaEditor";
import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import FunctionContractSignature from "@/pages/functions/contract/FunctionContractSignature";
import type { FunctionContractKind } from "@/pages/functions/types";
import { FunctionContractSide } from "@/pages/functions/types";

const CREATE_FUNCTION_MODAL_CONTRACT_KIND_OPTIONS: ToggleOption<FunctionContractKind>[] =
  CREATE_FUNCTION_MODAL_CONTRACT_KINDS.map((kind) => ({
    id: kind,
    label: FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[kind],
  }));

interface CreateFunctionModalContractLockedProps {
  caller: string;
}

const CreateFunctionModalContractLocked: FC<CreateFunctionModalContractLockedProps> = ({
  caller,
}) => {
  const contract = mapCreateFunctionModalStateToContract(useCreateFunctionModalState()).kind;

  if (!contract.case) return null;

  const renderSide = (side: FunctionContractSide) => (
    <FunctionContractSignature
      label={CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP[side]}
      side={side}
      contract={contract}
    />
  );

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
      <Alert isBanner header={`Contract set by ${caller}`}>
        It sends this input and expects this output
      </Alert>
      <FunctionContractCanvas
        input={renderSide(FunctionContractSide.INPUT)}
        output={renderSide(FunctionContractSide.OUTPUT)}
      />
    </Flex>
  );
};

const CreateFunctionModalContract: FC = () => {
  const { contractKind, contractCaller } = useCreateFunctionModalState();
  const { setContractKind } = useCreateFunctionModalActions();

  if (contractCaller !== undefined) {
    return <CreateFunctionModalContractLocked caller={contractCaller} />;
  }

  const renderSide = (side: FunctionContractSide) =>
    match(contractKind)
      .with("jsonSchema", () => <CreateFunctionModalContractSchemaEditor side={side} />)
      .with("arrow", () => <CreateFunctionModalContractArrowFields side={side} />)
      .exhaustive();

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
      <Flex padding={[8, 12]} shrink={0}>
        <ToggleInput
          ariaLabel="Contract kind"
          size={ToggleInputSize.SMALL}
          options={CREATE_FUNCTION_MODAL_CONTRACT_KIND_OPTIONS}
          value={contractKind}
          onChange={setContractKind}
        />
      </Flex>
      <Divider />
      <FunctionContractCanvas
        input={renderSide(FunctionContractSide.INPUT)}
        output={renderSide(FunctionContractSide.OUTPUT)}
      />
    </Flex>
  );
};

export default CreateFunctionModalContract;
