import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";
import Text, { TextSize, TextWeight } from "@galaxy-io/dls/text/Text";
import Widget from "@galaxy-io/dls/widget/Widget";

import KeyValueList from "@/components/KeyValueList";
import KeyValueRow from "@/components/KeyValueRow";

import { useCreateFunctionModalState } from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_MODE_TO_REVIEW_DESCRIPTION_MAP,
  CREATE_FUNCTION_MODAL_MODE_TO_REVIEW_HEADER_MAP,
  CREATE_FUNCTION_MODAL_REVIEW_MAX_WIDTH,
} from "@/pages/functions/components/create/constants";
import { CreateFunctionModalContractSide } from "@/pages/functions/components/create/types";
import { describeCreateFunctionModalContractSide } from "@/pages/functions/components/create/utils";
import FunctionInfoAlert from "@/pages/functions/components/FunctionInfoAlert";
import {
  FUNCTION_CONTRACT_KIND_TO_LABEL_MAP,
  INVOCATION_PROTOCOL_TO_LABEL_MAP,
} from "@/pages/functions/constants";

import { EMPTY_VALUE, formatMib, formatMillis } from "@/utils/format";

const CreateFunctionModalReview = () => {
  const state = useCreateFunctionModalState();
  const { mode, name, spec, protocol, contractKind } = state;

  return (
    <Flex
      direction={FlexDirection.COLUMN}
      gap={12}
      maxWidth={CREATE_FUNCTION_MODAL_REVIEW_MAX_WIDTH}
    >
      <Text as="h2" size={TextSize.HEADING_SM} weight={TextWeight.MEDIUM}>
        Final review
      </Text>
      <FunctionInfoAlert header={CREATE_FUNCTION_MODAL_MODE_TO_REVIEW_HEADER_MAP[mode]}>
        {CREATE_FUNCTION_MODAL_MODE_TO_REVIEW_DESCRIPTION_MAP[mode]}
      </FunctionInfoAlert>
      <Widget header="Image" isFlush>
        <KeyValueList hasBorder={false}>
          <KeyValueRow label="Name" value={name} isMono />
          <KeyValueRow label="Image" value={spec?.image ?? EMPTY_VALUE} isMono />
          <KeyValueRow label="Protocol" value={INVOCATION_PROTOCOL_TO_LABEL_MAP[protocol]} />
        </KeyValueList>
      </Widget>
      <Grid columns="repeat(2, minmax(0, 1fr))" gap={12}>
        <Widget header="Contract" isFlush>
          <KeyValueList hasBorder={false}>
            <KeyValueRow label="Kind" value={FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[contractKind]} />
            <KeyValueRow
              label="Input"
              value={describeCreateFunctionModalContractSide(
                state,
                CreateFunctionModalContractSide.INPUT,
              )}
              isMono
            />
            <KeyValueRow
              label="Output"
              value={describeCreateFunctionModalContractSide(
                state,
                CreateFunctionModalContractSide.OUTPUT,
              )}
              isMono
            />
          </KeyValueList>
        </Widget>
        <Widget header="Resources" isFlush>
          <KeyValueList hasBorder={false}>
            <KeyValueRow label="vCPUs" value={String(state.vcpus)} isMono />
            <KeyValueRow label="Memory" value={formatMib(state.memoryMib)} isMono />
            <KeyValueRow label="Timeout" value={formatMillis(state.timeoutMs)} isMono />
          </KeyValueList>
        </Widget>
      </Grid>
    </Flex>
  );
};

export default CreateFunctionModalReview;
