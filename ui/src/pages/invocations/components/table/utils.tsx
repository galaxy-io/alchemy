import type { TableColumn } from "@galaxy-io/dls/table/types";
import Text, { TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import InvocationStartKind from "@/pages/invocations/components/InvocationStartKind";
import InvocationStatus from "@/pages/invocations/components/InvocationStatus";
import {
  INVOCATIONS_TABLE_COLUMN_ID_CREATED_AT,
  INVOCATIONS_TABLE_COLUMN_ID_FUNCTION,
  INVOCATIONS_TABLE_COLUMN_ID_INVOCATION,
  INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_FUNCTION,
  INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_INVOCATION,
  INVOCATIONS_TABLE_COLUMN_WIDTH_CREATED_AT,
  INVOCATIONS_TABLE_COLUMN_WIDTH_DURATION,
  INVOCATIONS_TABLE_COLUMN_WIDTH_START_KIND,
  INVOCATIONS_TABLE_COLUMN_WIDTH_STATUS,
} from "@/pages/invocations/components/table/constants";

import { formatMicros, formatTimeAgo } from "@/utils/format";

export const createInvocationsTableColumns = (
  functionNameById: ReadonlyMap<AlchemyFunction["id"], AlchemyFunction["name"]>,
): TableColumn<Invocation>[] => [
  {
    id: "status",
    header: "Status",
    accessor: (row) => row.status,
    canSort: true,
    width: INVOCATIONS_TABLE_COLUMN_WIDTH_STATUS,
    cell: ({ row }) => <InvocationStatus invocation={row} />,
  } satisfies TableColumn<Invocation, number>,
  {
    id: INVOCATIONS_TABLE_COLUMN_ID_FUNCTION,
    header: "Function",
    accessor: (row) => functionNameById.get(row.functionId) ?? row.functionId,
    isRowHeader: true,
    canSort: true,
    minWidth: INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_FUNCTION,
    cell: ({ value }) => (
      <Text lineClamp={1} shouldTooltipOnOverflow>
        {value}
      </Text>
    ),
  } satisfies TableColumn<Invocation, string>,
  {
    id: INVOCATIONS_TABLE_COLUMN_ID_INVOCATION,
    header: "Invocation",
    accessor: (row) => row.id,
    minWidth: INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_INVOCATION,
    cell: ({ value }) => (
      <Text family={FontFamily.MONO} variant={TextVariant.SECONDARY} lineClamp={1}>
        {value}
      </Text>
    ),
  } satisfies TableColumn<Invocation, string>,
  {
    id: "startKind",
    header: "Start",
    accessor: (row) => row.startKind,
    canSort: true,
    width: INVOCATIONS_TABLE_COLUMN_WIDTH_START_KIND,
    cell: ({ row }) => <InvocationStartKind startKind={row.startKind} />,
  } satisfies TableColumn<Invocation, number>,
  {
    id: "duration",
    header: "Duration",
    accessor: (row) => (row.stats ? Number(row.stats.totalUs) : -1),
    align: "right",
    canSort: true,
    width: INVOCATIONS_TABLE_COLUMN_WIDTH_DURATION,
    cell: ({ row }) => (
      <Text family={FontFamily.MONO} isTabular>
        {formatMicros(row.stats ? Number(row.stats.totalUs) : undefined)}
      </Text>
    ),
  } satisfies TableColumn<Invocation, number>,
  {
    id: INVOCATIONS_TABLE_COLUMN_ID_CREATED_AT,
    header: "Created",
    accessor: (row) => Number(row.createdAt),
    align: "right",
    canSort: true,
    width: INVOCATIONS_TABLE_COLUMN_WIDTH_CREATED_AT,
    cell: ({ row }) => <Text variant={TextVariant.SECONDARY}>{formatTimeAgo(row.createdAt)}</Text>,
  } satisfies TableColumn<Invocation, number>,
];
