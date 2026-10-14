import type { FC } from "react";

import { create } from "@bufbuild/protobuf";
import { ListIcon, ListMagnifyingGlassIcon } from "@phosphor-icons/react";

import Box from "@galaxy-io/dls/layout/Box";
import EmptyLayout, { EmptyLayoutSize } from "@galaxy-io/dls/layout/EmptyLayout";
import Widget from "@galaxy-io/dls/widget/Widget";

import { ListInvocationsRequestSchema } from "@/gen/functions/v1/invocations_pb";

import InvocationsTable from "@/components/invocations/table/InvocationsTable";
import { InvocationsTableVariant } from "@/components/invocations/table/types";

import {
  OBSERVABILITY_LATEST_INVOCATIONS_HEADER_HEIGHT,
  OBSERVABILITY_LATEST_INVOCATIONS_LIMIT,
  OBSERVABILITY_LATEST_INVOCATIONS_ROW_HEIGHT,
} from "@/pages/observability/components/latest/constants";

import { useListInvocationsQuery } from "@/api/queries/invocations";

const OBSERVABILITY_LATEST_INVOCATIONS_INPUT = create(ListInvocationsRequestSchema, {
  pagination: { pageSize: OBSERVABILITY_LATEST_INVOCATIONS_LIMIT },
});

const OBSERVABILITY_LATEST_INVOCATIONS_HEIGHT =
  OBSERVABILITY_LATEST_INVOCATIONS_LIMIT * OBSERVABILITY_LATEST_INVOCATIONS_ROW_HEIGHT +
  OBSERVABILITY_LATEST_INVOCATIONS_HEADER_HEIGHT;

const ObservabilityLatestInvocationsWidget: FC = () => {
  const { data, isLoading } = useListInvocationsQuery({
    input: OBSERVABILITY_LATEST_INVOCATIONS_INPUT,
  });

  return (
    <Widget header="Latest invocations" icon={ListIcon} isFlush gap={0}>
      <Box height={OBSERVABILITY_LATEST_INVOCATIONS_HEIGHT}>
        <InvocationsTable
          invocations={data?.invocations ?? []}
          isLoading={isLoading}
          variant={InvocationsTableVariant.COMPACT}
          emptyState={
            <EmptyLayout
              size={EmptyLayoutSize.SMALL}
              icon={ListMagnifyingGlassIcon}
              header="No invocations yet"
            />
          }
        />
      </Box>
    </Widget>
  );
};

export default ObservabilityLatestInvocationsWidget;
