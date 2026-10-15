import type { TableColumn } from "@galaxy-io/dls/table/types";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import FunctionName from "@/components/functions/FunctionName";
import {
  INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_FUNCTION,
  INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_INVOCATION,
  INVOCATIONS_TABLE_COLUMN_WIDTH_CREATED_AT,
  INVOCATIONS_TABLE_COLUMN_WIDTH_DURATION,
  INVOCATIONS_TABLE_COLUMN_WIDTH_START_KIND,
  INVOCATIONS_TABLE_COLUMN_WIDTH_STATUS,
} from "@/components/invocations/constants";
import InvocationStartKind from "@/components/invocations/InvocationStartKind";
import InvocationStatus from "@/components/invocations/InvocationStatus";
import { InvocationsTableVariant } from "@/components/invocations/table/types";
import RelativeTime from "@/components/RelativeTime";

import { formatMicros } from "@/utils/format";

const INVOCATIONS_TABLE_STATUS_COLUMN: TableColumn<Invocation> = {
  id: "status",
  header: "Status",
  width: INVOCATIONS_TABLE_COLUMN_WIDTH_STATUS,
  cell: ({ row }) => <InvocationStatus invocation={row} />,
};

const INVOCATIONS_TABLE_FUNCTION_COLUMN: TableColumn<Invocation> = {
  id: "function",
  header: "Function",
  minWidth: INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_FUNCTION,
  isRowHeader: true,
  cell: ({ row }) => <FunctionName functionId={row.functionId} />,
};

const INVOCATIONS_TABLE_INVOCATION_COLUMN: TableColumn<Invocation> = {
  id: "invocation",
  header: "Invocation",
  minWidth: INVOCATIONS_TABLE_COLUMN_MIN_WIDTH_INVOCATION,
  cell: ({ row }) => (
    <Text
      size={TextSize.BODY_SM}
      family={FontFamily.MONO}
      variant={TextVariant.SECONDARY}
      lineClamp={1}
    >
      {row.id}
    </Text>
  ),
};

const INVOCATIONS_TABLE_TRAILING_COLUMNS: TableColumn<Invocation>[] = [
  {
    id: "start",
    header: "Start",
    width: INVOCATIONS_TABLE_COLUMN_WIDTH_START_KIND,
    cell: ({ row }) => <InvocationStartKind startKind={row.startKind} />,
  },
  {
    id: "duration",
    header: "Duration",
    width: INVOCATIONS_TABLE_COLUMN_WIDTH_DURATION,
    align: "right",
    cell: ({ row }) => (
      <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isTabular>
        {formatMicros(row.stats?.totalUs)}
      </Text>
    ),
  },
  {
    id: "created",
    header: "Created",
    width: INVOCATIONS_TABLE_COLUMN_WIDTH_CREATED_AT,
    align: "right",
    cell: ({ row }) => <RelativeTime unixMillis={row.createdAt} />,
  },
];

const INVOCATIONS_TABLE_FULL_COLUMNS: TableColumn<Invocation>[] = [
  INVOCATIONS_TABLE_STATUS_COLUMN,
  INVOCATIONS_TABLE_FUNCTION_COLUMN,
  INVOCATIONS_TABLE_INVOCATION_COLUMN,
  ...INVOCATIONS_TABLE_TRAILING_COLUMNS,
];

const INVOCATIONS_TABLE_COMPACT_COLUMNS: TableColumn<Invocation>[] = [
  INVOCATIONS_TABLE_STATUS_COLUMN,
  INVOCATIONS_TABLE_FUNCTION_COLUMN,
  ...INVOCATIONS_TABLE_TRAILING_COLUMNS,
];

const INVOCATIONS_TABLE_FUNCTION_SCOPED_COLUMNS: TableColumn<Invocation>[] = [
  INVOCATIONS_TABLE_STATUS_COLUMN,
  { ...INVOCATIONS_TABLE_INVOCATION_COLUMN, isRowHeader: true },
  ...INVOCATIONS_TABLE_TRAILING_COLUMNS,
];

export const INVOCATIONS_TABLE_VARIANT_TO_COLUMNS_MAP: Record<
  InvocationsTableVariant,
  TableColumn<Invocation>[]
> = {
  [InvocationsTableVariant.FULL]: INVOCATIONS_TABLE_FULL_COLUMNS,
  [InvocationsTableVariant.COMPACT]: INVOCATIONS_TABLE_COMPACT_COLUMNS,
  [InvocationsTableVariant.FUNCTION_SCOPED]: INVOCATIONS_TABLE_FUNCTION_SCOPED_COLUMNS,
};
