import { useMemo } from "react";

import { ListMagnifyingGlassIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import SearchInput from "@galaxy-io/dls/inputs/SearchInput";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import type { Invocation, InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import EmptyLayout from "@/layouts/EmptyLayout";
import PageLayout from "@/layouts/page/PageLayout";

import InvocationsStatusFilter from "@/pages/invocations/components/InvocationsStatusFilter";
import InvocationsTimeframeToggle from "@/pages/invocations/components/InvocationsTimeframeToggle";
import InvocationsTable from "@/pages/invocations/components/table/InvocationsTable";
import { INVOCATIONS_DEFAULT_TIMEFRAME } from "@/pages/invocations/constants";
import type { InvocationsTimeframe } from "@/pages/invocations/types";
import { filterInvocations } from "@/pages/invocations/utils";

import { useSuspenseListInvocationsQuery } from "@/api/queries/invocations";

import {
  useAlchemyLayoutSearch,
  useAlchemySearchUpdate,
  useInvocationsSearch,
} from "@/module/hooks";
import type { AlchemyLayoutSearch, InvocationsSearch } from "@/module/schemas";

const InvocationsPage = () => {
  const updateSearch = useAlchemySearchUpdate<InvocationsSearch & AlchemyLayoutSearch>();
  const {
    q: term = "",
    timeframe = INVOCATIONS_DEFAULT_TIMEFRAME,
    statuses = [],
  } = useInvocationsSearch();
  const { invocationId } = useAlchemyLayoutSearch();

  const { data } = useSuspenseListInvocationsQuery();

  const invocations = useMemo(
    () => filterInvocations(data.invocations, { timeframe, statuses, term }),
    [data.invocations, timeframe, statuses, term],
  );
  const isFiltered = statuses.length > 0 || term !== "";

  const handleSearch = (nextTerm: string) => {
    void updateSearch((prev) => ({ ...prev, q: nextTerm || undefined }), { replace: true });
  };

  const handleTimeframeChange = (nextTimeframe: InvocationsTimeframe) => {
    void updateSearch(
      (prev) => ({
        ...prev,
        timeframe: nextTimeframe === INVOCATIONS_DEFAULT_TIMEFRAME ? undefined : nextTimeframe,
      }),
      { replace: true },
    );
  };

  const handleStatusesChange = (nextStatuses: InvocationStatus[]) => {
    void updateSearch(
      (prev) => ({ ...prev, statuses: nextStatuses.length ? nextStatuses : undefined }),
      { replace: true },
    );
  };

  const handleSelect = (invocation: Invocation) => {
    void updateSearch((prev) => ({ ...prev, invocationId: invocation.id }));
  };

  return (
    <PageLayout
      title="Invocations"
      actions={<InvocationsTimeframeToggle value={timeframe} onChange={handleTimeframeChange} />}
      toolbar={
        <>
          <Flex grow={1} minWidth={0}>
            <SearchInput
              ariaLabel="Search invocations"
              placeholder="Search"
              defaultValue={term}
              onSearch={handleSearch}
              fillWidth
            />
          </Flex>
          <InvocationsStatusFilter value={statuses} onChange={handleStatusesChange} />
        </>
      }
    >
      <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
        <InvocationsTable
          invocations={invocations}
          activeId={invocationId}
          onSelect={handleSelect}
          emptyState={
            isFiltered ? (
              <EmptyLayout
                icon={MagnifyingGlassIcon}
                header="No invocations match"
                actions={
                  <Button
                    label="Clear filters"
                    variant={ButtonVariant.SECONDARY}
                    onClick={() => handleStatusesChange([])}
                  />
                }
              />
            ) : (
              <EmptyLayout icon={ListMagnifyingGlassIcon} header="No invocations in this window" />
            )
          }
        />
      </Flex>
    </PageLayout>
  );
};

export default InvocationsPage;
