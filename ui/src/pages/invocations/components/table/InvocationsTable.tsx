import { type ReactNode, useMemo } from "react";

import InfiniteTable from "@galaxy-io/dls/table/InfiniteTable";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import {
  INVOCATIONS_TABLE_COLUMN_ID_CREATED_AT,
  INVOCATIONS_TABLE_COLUMN_ID_FUNCTION,
  INVOCATIONS_TABLE_COLUMN_ID_INVOCATION,
} from "@/pages/invocations/components/table/constants";
import { createInvocationsTableColumns } from "@/pages/invocations/components/table/utils";

import { useSuspenseListFunctionsQuery } from "@/api/queries/functions";

interface InvocationsTableProps {
  invocations: Invocation[];
  hasFunctionColumn?: boolean;
  isCompact?: boolean;
  activeId?: Invocation["id"];
  onSelect?: (invocation: Invocation) => void;
  emptyState?: ReactNode;
}

const InvocationsTable = ({
  invocations,
  hasFunctionColumn = true,
  isCompact = false,
  activeId,
  onSelect,
  emptyState,
}: InvocationsTableProps) => {
  const { data: functionsData } = useSuspenseListFunctionsQuery();

  const columns = useMemo(() => {
    const functionNameById = new Map(
      functionsData.functions.map((fn) => [fn.id, fn.name] as const),
    );
    return createInvocationsTableColumns(functionNameById)
      .filter(
        (column) =>
          (hasFunctionColumn || column.id !== INVOCATIONS_TABLE_COLUMN_ID_FUNCTION) &&
          (!isCompact || column.id !== INVOCATIONS_TABLE_COLUMN_ID_INVOCATION),
      )
      .map((column) =>
        !hasFunctionColumn && column.id === INVOCATIONS_TABLE_COLUMN_ID_INVOCATION
          ? { ...column, isRowHeader: true }
          : column,
      );
  }, [functionsData, hasFunctionColumn, isCompact]);

  return (
    <InfiniteTable<Invocation>
      ariaLabel="Invocations"
      columns={columns}
      data={invocations}
      getRowId={(row) => row.id}
      defaultSort={{ columnId: INVOCATIONS_TABLE_COLUMN_ID_CREATED_AT, isDescending: true }}
      {...(activeId !== undefined ? { activeRowId: activeId } : {})}
      {...(onSelect ? { onRowClick: onSelect } : {})}
      {...(emptyState !== undefined ? { emptyState } : {})}
    />
  );
};

export default InvocationsTable;
