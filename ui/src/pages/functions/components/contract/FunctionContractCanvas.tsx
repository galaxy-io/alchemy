import type { ReactNode } from "react";

import { styled } from "@linaria/react";

import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import { HAIRLINE_WIDTH } from "@galaxy-io/dls/styles/mixins";
import { t } from "@galaxy-io/dls/theme/tokens/t";

import { FUNCTION_CONTRACT_CANVAS_INSET } from "@/pages/functions/components/contract/constants";

const ConnectorWrapper = styled.div`
  position: relative;
  flex: 0 0 ${FUNCTION_CONTRACT_CANVAS_INSET}px;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    border-top: ${HAIRLINE_WIDTH} solid ${t.color.border.primary};
  }
`;

interface FunctionContractCanvasProps {
  input: ReactNode;
  output: ReactNode;
}

const FunctionContractCanvas = ({ input, output }: FunctionContractCanvasProps) => (
  <Flex
    alignItems={AlignItems.STRETCH}
    grow={1}
    minHeight={0}
    padding={FUNCTION_CONTRACT_CANVAS_INSET}
    fillWidth
  >
    {input}
    <ConnectorWrapper aria-hidden />
    {output}
  </Flex>
);

export default FunctionContractCanvas;
