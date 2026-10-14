import { useMemo } from "react";

import { create } from "@bufbuild/protobuf";
import { ListMagnifyingGlassIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";

import {
  type Invocation,
  type InvocationStatus,
  ListInvocationsRequestSchema,
} from "@/gen/functions/v1/invocations_pb";

import EmptyLayout from "@/layouts/EmptyLayout";

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
  useFunctionInvocationsSearch,
  useFunctionParams,
} from "@/module/hooks";
import type { AlchemyLayoutSearch, FunctionInvocationsSearch } from "@/module/schemas";

const FunctionInvocationsPage = () => {
  const updateSearch = useAlchemySearchUpdate<FunctionInvocationsSearch & AlchemyLayoutSearch>();
  const { id } = useFunctionParams();
  const { invocationId } = useAlchemyLayoutSearch();
  const { timeframe = INVOCATIONS_DEFAULT_TIMEFRAME, statuses = [] } =
    useFunctionInvocationsSearch();

  const { data } = useSuspenseListInvocationsQuery({
    input: create(ListInvocationsRequestSchema, { functionIds: [id] }),
  });
  const invocations = useMemo(
    () => filterInvocations(data.invocations, { timeframe, statuses }),
    [data.invocations, timeframe, statuses],
  );

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
    <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
      <Flex alignItems={AlignItems.CENTER} gap={8} padding={[8, 16]} shrink={0}>
        <InvocationsStatusFilter value={statuses} onChange={handleStatusesChange} />
        <Flex grow={1} />
        <InvocationsTimeframeToggle value={timeframe} onChange={handleTimeframeChange} />
      </Flex>
      <Divider />
      <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
        <InvocationsTable
          invocations={invocations}
          hasFunctionColumn={false}
          activeId={invocationId}
          onSelect={handleSelect}
          emptyState={
            statuses.length > 0 ? (
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
    </Flex>
  );
};

export default FunctionInvocationsPage;
