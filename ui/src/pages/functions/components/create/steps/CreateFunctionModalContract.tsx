import { match } from "ts-pattern";

import ToggleInput from "@galaxy-io/dls/inputs/ToggleInput";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import FunctionContractCanvas from "@/pages/functions/components/contract/FunctionContractCanvas";
import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import { CREATE_FUNCTION_MODAL_CONTRACT_KINDS } from "@/pages/functions/components/create/constants";
import CreateFunctionModalContractArrowFields from "@/pages/functions/components/create/steps/components/CreateFunctionModalContractArrowFields";
import CreateFunctionModalContractSchemaEditor from "@/pages/functions/components/create/steps/components/CreateFunctionModalContractSchemaEditor";
import { CreateFunctionModalContractSide } from "@/pages/functions/components/create/types";
import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";

const CreateFunctionModalContract = () => {
  const { contractKind } = useCreateFunctionModalState();
  const { setContractKind } = useCreateFunctionModalActions();

  const renderSide = (side: CreateFunctionModalContractSide) =>
    match(contractKind)
      .with("jsonSchema", () => <CreateFunctionModalContractSchemaEditor side={side} />)
      .with("arrow", () => <CreateFunctionModalContractArrowFields side={side} />)
      .exhaustive();

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
      <Flex padding={[12, 16]} shrink={0}>
        <ToggleInput
          ariaLabel="Contract kind"
          options={CREATE_FUNCTION_MODAL_CONTRACT_KINDS.map((kind) => ({
            id: kind,
            label: FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[kind],
          }))}
          value={contractKind}
          onChange={setContractKind}
        />
      </Flex>
      <Divider />
      <FunctionContractCanvas
        input={renderSide(CreateFunctionModalContractSide.INPUT)}
        output={renderSide(CreateFunctionModalContractSide.OUTPUT)}
      />
    </Flex>
  );
};

export default CreateFunctionModalContract;
