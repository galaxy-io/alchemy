import { type FC, useMemo } from "react";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import PageLayout from "@galaxy-io/dls/layout/PageLayout";

import { useInvocationsFilters } from "@/components/invocations/hooks/useInvocationsFilters";
import InvocationsEmptyState from "@/components/invocations/InvocationsEmptyState";
import InvocationsStatusFilter from "@/components/invocations/InvocationsStatusFilter";
import InvocationsTimeframeToggle from "@/components/invocations/InvocationsTimeframeToggle";
import InvocationsTable from "@/components/invocations/table/InvocationsTable";

import {
  createListInvocationsInput,
  useSuspenseListInvocationsInfiniteQuery,
} from "@/api/queries/invocations";

const InvocationsPage: FC = () => {
  const { timeframe, statuses, sinceMs, handleTimeframeChange, handleStatusesChange } =
    useInvocationsFilters();

  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSuspenseListInvocationsInfiniteQuery({
      input: createListInvocationsInput({ statuses, sinceMs }),
    });

  const invocations = useMemo(() => data.pages.flatMap((page) => page.invocations), [data.pages]);

  return (
    <PageLayout
      header="Invocations"
      actions={<InvocationsTimeframeToggle value={timeframe} onChange={handleTimeframeChange} />}
      toolbar={<InvocationsStatusFilter value={statuses} onChange={handleStatusesChange} />}
    >
      <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minHeight={0} fillWidth>
        <InvocationsTable
          invocations={invocations}
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
    </PageLayout>
  );
};

export default InvocationsPage;
