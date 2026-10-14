import type { FC } from "react";

import { match } from "ts-pattern";

import ToggleInput, { type ToggleOption } from "@galaxy-io/dls/inputs/ToggleInput";
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
import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import type { FunctionContractKind } from "@/pages/functions/types";
import { FunctionContractSide } from "@/pages/functions/types";

const CREATE_FUNCTION_MODAL_CONTRACT_KIND_OPTIONS: ToggleOption<FunctionContractKind>[] =
  CREATE_FUNCTION_MODAL_CONTRACT_KINDS.map((kind) => ({
    id: kind,
    label: FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[kind],
  }));

const CreateFunctionModalContract: FC = () => {
  const { contractKind } = useCreateFunctionModalState();
  const { setContractKind } = useCreateFunctionModalActions();

  const renderSide = (side: FunctionContractSide) =>
    match(contractKind)
      .with("jsonSchema", () => <CreateFunctionModalContractSchemaEditor side={side} />)
      .with("arrow", () => <CreateFunctionModalContractArrowFields side={side} />)
      .exhaustive();

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
      <Flex padding={[12, 16]} shrink={0}>
        <ToggleInput
          ariaLabel="Contract kind"
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
