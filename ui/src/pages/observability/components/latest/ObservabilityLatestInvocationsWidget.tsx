import Box from "@galaxy-io/dls/layout/Box";
import Widget from "@galaxy-io/dls/widget/Widget";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import InvocationsTable from "@/pages/invocations/components/table/InvocationsTable";
import {
  OBSERVABILITY_LATEST_INVOCATIONS_HEADER_HEIGHT,
  OBSERVABILITY_LATEST_INVOCATIONS_LIMIT,
  OBSERVABILITY_LATEST_INVOCATIONS_ROW_HEIGHT,
} from "@/pages/observability/components/latest/constants";

import { useSuspenseListInvocationsQuery } from "@/api/queries/invocations";

import { useAlchemySearchUpdate } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";

const ObservabilityLatestInvocationsWidget = () => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const { data } = useSuspenseListInvocationsQuery();

  const handleSelect = (invocation: Invocation) => {
    void updateSearch((prev) => ({ ...prev, invocationId: invocation.id }));
  };

  return (
    <Widget header="Latest invocations" isFlush gap={0}>
      <Box
        height={
          OBSERVABILITY_LATEST_INVOCATIONS_LIMIT * OBSERVABILITY_LATEST_INVOCATIONS_ROW_HEIGHT +
          OBSERVABILITY_LATEST_INVOCATIONS_HEADER_HEIGHT
        }
      >
        <InvocationsTable
          invocations={data.invocations.slice(0, OBSERVABILITY_LATEST_INVOCATIONS_LIMIT)}
          isCompact
          onSelect={handleSelect}
        />
      </Box>
    </Widget>
  );
};

export default ObservabilityLatestInvocationsWidget;
