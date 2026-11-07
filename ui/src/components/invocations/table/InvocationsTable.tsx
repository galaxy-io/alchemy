import type { FC, ReactNode } from "react";

import InfiniteTable from "@galaxy-io/dls/table/InfiniteTable";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import { INVOCATIONS_TABLE_VARIANT_TO_COLUMNS_MAP } from "@/components/invocations/table/constants";
import { InvocationsTableVariant } from "@/components/invocations/table/types";

import { useAlchemyLayoutSearch, useAlchemySearchUpdate } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";

interface InvocationsTableProps {
  invocations: Invocation[];
  emptyState: ReactNode;
  variant?: InvocationsTableVariant;
  isLoading?: boolean;
  onEndReached?: () => void;
}

const InvocationsTable: FC<InvocationsTableProps> = ({
  invocations,
  emptyState,
  variant = InvocationsTableVariant.FULL,
  isLoading,
  onEndReached,
}) => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const { invocationId } = useAlchemyLayoutSearch();

  const handleRowClick = (row: Invocation) => {
    void updateSearch((prev) => ({
      ...prev,
      flow: undefined,
      invocationId: row.id,
      invocationAttempt: undefined,
    }));
  };

  return (
    <InfiniteTable<Invocation>
      ariaLabel="Invocations"
      columns={INVOCATIONS_TABLE_VARIANT_TO_COLUMNS_MAP[variant]}
      data={invocations}
      getRowId={(invocation) => invocation.id}
      activeRowId={invocationId ?? null}
      onRowClick={handleRowClick}
      emptyState={emptyState}
      isLoading={isLoading}
      onEndReached={onEndReached}
    />
  );
};

export default InvocationsTable;
