import { type FC, useMemo } from "react";

import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";

import { useInvocationsFilters } from "@/components/invocations/hooks/useInvocationsFilters";
import InvocationsEmptyState from "@/components/invocations/InvocationsEmptyState";
import InvocationsStatusFilter from "@/components/invocations/InvocationsStatusFilter";
import InvocationsTimeframeToggle from "@/components/invocations/InvocationsTimeframeToggle";
import InvocationsTable from "@/components/invocations/table/InvocationsTable";
import { InvocationsTableVariant } from "@/components/invocations/table/types";

import { useFunctionParams } from "@/module/hooks";

import {
  createListInvocationsInput,
  useSuspenseListInvocationsInfiniteQuery,
} from "@/api/queries/invocations";

const FunctionInvocationsPage: FC = () => {
  const { id } = useFunctionParams();
  const { timeframe, statuses, sinceMs, handleTimeframeChange, handleStatusesChange } =
    useInvocationsFilters();

  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSuspenseListInvocationsInfiniteQuery({
      input: createListInvocationsInput({ functionId: id, statuses, sinceMs }),
    });
  const invocations = useMemo(() => data.pages.flatMap((page) => page.invocations), [data.pages]);

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minHeight={0} fillWidth>
      <Flex
        alignItems={AlignItems.CENTER}
        justifyContent={JustifyContent.SPACE_BETWEEN}
        gap={8}
        padding={[8, 16]}
        shrink={0}
      >
        <InvocationsStatusFilter value={statuses} onChange={handleStatusesChange} />
        <InvocationsTimeframeToggle value={timeframe} onChange={handleTimeframeChange} />
      </Flex>
      <Divider />
      <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minHeight={0}>
        <InvocationsTable
          invocations={invocations}
          variant={InvocationsTableVariant.FUNCTION_SCOPED}
          isLoading={isFetchingNextPage}
          onEndReached={() => {
            if (hasNextPage) fetchNextPage();
          }}
          emptyState={
            <InvocationsEmptyState
              hasFilters={statuses.length > 0}
              onClear={() => handleStatusesChange([])}
            />
          }
        />
      </Flex>
    </Flex>
  );
};

export default FunctionInvocationsPage;
