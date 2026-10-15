import { type FC, type MouseEvent, useMemo } from "react";

import { create } from "@bufbuild/protobuf";
import { styled } from "@linaria/react";

import Skeleton, { SkeletonSize } from "@galaxy-io/dls/feedback/Skeleton";
import Box from "@galaxy-io/dls/layout/Box";
import Flex from "@galaxy-io/dls/layout/Flex";
import Square, { SquareSize, SquareVariant } from "@galaxy-io/dls/shapes/Square";
import { FOCUS_RING, INTERACTIVE_RESET } from "@galaxy-io/dls/styles/mixins";
import { t } from "@galaxy-io/dls/theme/tokens/t";
import Tooltip from "@galaxy-io/dls/tooltip/Tooltip";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import { type Invocation, ListInvocationsRequestSchema } from "@/gen/functions/v1/invocations_pb";

import { INVOCATION_STATUS_TO_LABEL_MAP } from "@/components/invocations/constants";
import InvocationStatusSwatch from "@/components/invocations/InvocationStatusSwatch";

import {
  FUNCTION_CARD_RECENT_INVOCATIONS_LENGTH,
  FUNCTION_CARD_RECENT_INVOCATIONS_SKELETON_WIDTH,
} from "@/pages/functions/components/card/constants";

import { useAlchemySearchUpdate } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";

import { useListInvocationsQuery } from "@/api/queries/invocations";

import { formatTimestamp } from "@/utils/format";

const FunctionCardRecentInvocationsWrapper = styled.div`
  display: flex;
  gap: ${t.space[4]};

  & > * {
    transition: opacity ${t.duration.fast};
  }

  &:hover > *:not(:hover):not([data-tippy-root]) {
    opacity: 0.4;
  }
`;

const FunctionCardRecentInvocationsButton = styled.button`
  ${INTERACTIVE_RESET}
  ${FOCUS_RING}
  display: flex;
  border-radius: ${t.radius.sm};
`;

interface FunctionCardRecentInvocationsProps {
  functionId: AlchemyFunction["id"];
}

const FunctionCardRecentInvocations: FC<FunctionCardRecentInvocationsProps> = ({ functionId }) => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const { data, isLoading } = useListInvocationsQuery({
    input: create(ListInvocationsRequestSchema, {
      functionIds: [functionId],
      pagination: { pageSize: FUNCTION_CARD_RECENT_INVOCATIONS_LENGTH },
    }),
  });

  const invocations = useMemo(() => [...(data?.invocations ?? [])].reverse(), [data]);

  const handleInvocationClick = (event: MouseEvent, invocationId: Invocation["id"]) => {
    event.stopPropagation();
    void updateSearch((prev) => ({ ...prev, invocationId }));
  };

  if (isLoading) {
    return (
      <Box width={FUNCTION_CARD_RECENT_INVOCATIONS_SKELETON_WIDTH}>
        <Skeleton size={SkeletonSize.X_SMALL} />
      </Box>
    );
  }

  return (
    <FunctionCardRecentInvocationsWrapper>
      {Array.from({ length: FUNCTION_CARD_RECENT_INVOCATIONS_LENGTH }, (_, index) => {
        const invocation = invocations[index];
        if (invocation) {
          const label = INVOCATION_STATUS_TO_LABEL_MAP[invocation.status];
          return (
            <Tooltip key={invocation.id} body={`${label} ${formatTimestamp(invocation.createdAt)}`}>
              <FunctionCardRecentInvocationsButton
                type="button"
                aria-label={`View ${label.toLowerCase()} invocation`}
                onClick={(event) => handleInvocationClick(event, invocation.id)}
              >
                <InvocationStatusSwatch status={invocation.status} size={SquareSize.MEDIUM} />
              </FunctionCardRecentInvocationsButton>
            </Tooltip>
          );
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder slots with no identity
          <Flex key={`empty-${index}`}>
            <Square size={SquareSize.MEDIUM} variant={SquareVariant.DISABLED} />
          </Flex>
        );
      })}
    </FunctionCardRecentInvocationsWrapper>
  );
};

export default FunctionCardRecentInvocations;
