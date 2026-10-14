import { useMemo } from "react";

import { create } from "@bufbuild/protobuf";

import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import {
  type Invocation,
  InvocationStatus,
  ListInvocationsRequestSchema,
} from "@/gen/functions/v1/invocations_pb";

import MetricGroup from "@/components/metrics/MetricGroup";

import InvocationStatusSwatch from "@/pages/invocations/components/InvocationStatusSwatch";
import InvocationsTable from "@/pages/invocations/components/table/InvocationsTable";
import { InvocationsTimeframe } from "@/pages/invocations/types";
import {
  countInvocationsByStatus,
  filterInvocationsInTimeframe,
  getInvocationDurations,
  getPercentile,
  getWarmRate,
} from "@/pages/invocations/utils";

import { useSuspenseListInvocationsQuery } from "@/api/queries/invocations";

import { useAlchemyLayoutSearch, useAlchemySearchUpdate, useFunctionParams } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";
import { formatCount, formatMicros, formatPercent } from "@/utils/format";

const FunctionOverviewPage = () => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const { id } = useFunctionParams();
  const { invocationId } = useAlchemyLayoutSearch();

  const { data } = useSuspenseListInvocationsQuery({
    input: create(ListInvocationsRequestSchema, { functionIds: [id] }),
  });
  const invocations = data.invocations;

  const windowed = useMemo(
    () => filterInvocationsInTimeframe(invocations, InvocationsTimeframe.TWENTY_FOUR_HOURS),
    [invocations],
  );
  const counts = countInvocationsByStatus(windowed);

  const handleSelect = (invocation: Invocation) => {
    void updateSearch((prev) => ({ ...prev, invocationId: invocation.id }));
  };

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
      <Flex padding={16} shrink={0}>
        <MetricGroup
          primary={{ label: "Invocations · 24h", value: formatCount(windowed.length) }}
          tiles={[
            {
              label: "Succeeded",
              value: formatCount(counts[InvocationStatus.SUCCEEDED]),
              mark: <InvocationStatusSwatch status={InvocationStatus.SUCCEEDED} />,
            },
            {
              label: "Failed",
              value: formatCount(
                counts[InvocationStatus.FAILED] + counts[InvocationStatus.ERRORED],
              ),
              mark: <InvocationStatusSwatch status={InvocationStatus.FAILED} />,
            },
            {
              label: "Success",
              value: formatPercent(
                windowed.length === 0 ? null : counts[InvocationStatus.SUCCEEDED] / windowed.length,
                1,
              ),
            },
            {
              label: "p50",
              value: formatMicros(getPercentile(getInvocationDurations(windowed, "totalUs"), 50)),
            },
            { label: "Warm", value: formatPercent(getWarmRate(windowed), 0) },
          ]}
        />
      </Flex>
      <Divider />
      <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
        <InvocationsTable
          invocations={invocations}
          hasFunctionColumn={false}
          activeId={invocationId}
          onSelect={handleSelect}
        />
      </Flex>
    </Flex>
  );
};

export default FunctionOverviewPage;
