import Flex from "@galaxy-io/dls/layout/Flex";
import Square, { SquareSize } from "@galaxy-io/dls/shapes/Square";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import { FUNCTION_CARD_RECENT_INVOCATIONS_LENGTH } from "@/pages/functions/components/card/constants";
import InvocationStatusSwatch from "@/pages/invocations/components/InvocationStatusSwatch";

interface FunctionCardRecentInvocationsProps {
  invocations: Invocation[];
}

const FunctionCardRecentInvocations = ({ invocations }: FunctionCardRecentInvocationsProps) => {
  const recentInvocations = invocations.slice(0, FUNCTION_CARD_RECENT_INVOCATIONS_LENGTH).reverse();
  const ghostIds = Array.from(
    { length: Math.max(0, FUNCTION_CARD_RECENT_INVOCATIONS_LENGTH - recentInvocations.length) },
    (_, index) => `ghost-${index}`,
  );

  return (
    <Flex gap={4}>
      {ghostIds.map((id) => (
        <Square key={id} size={SquareSize.SMALL} />
      ))}
      {recentInvocations.map((invocation) => (
        <InvocationStatusSwatch
          key={invocation.id}
          status={invocation.status}
          size={SquareSize.SMALL}
        />
      ))}
    </Flex>
  );
};

export default FunctionCardRecentInvocations;
