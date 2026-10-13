import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import type { TableColumn } from "@galaxy-io/dls/table/types";
import Text, { TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import FunctionVersionStatusChip from "@/pages/functions/components/FunctionVersionStatusChip";
import { formatFunctionVersion } from "@/pages/functions/utils";
import {
  FUNCTION_VERSIONS_TABLE_COLUMN_ID_VERSION,
  FUNCTION_VERSIONS_TABLE_COLUMN_MIN_WIDTH_IMAGE,
  FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_BUILD,
  FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_CREATED_AT,
  FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_ROOTFS,
  FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_STATUS,
  FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_VERSION,
} from "@/pages/functions/versions/constants";
import type { FunctionVersionsTableRow } from "@/pages/functions/versions/types";

import { EMPTY_VALUE, formatBytes, formatMillis, formatTimeAgo } from "@/utils/format";

export const createFunctionVersionsTableColumns = (): TableColumn<FunctionVersionsTableRow>[] => [
  {
    id: FUNCTION_VERSIONS_TABLE_COLUMN_ID_VERSION,
    header: "Version",
    accessor: (row) => Number(row.version.version),
    isRowHeader: true,
    canSort: true,
    width: FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_VERSION,
    cell: ({ row }) => (
      <Flex gap={8} alignItems={AlignItems.CENTER}>
        <Text family={FontFamily.MONO}>{formatFunctionVersion(row.version.version)}</Text>
        {row.isCurrent && (
          <Chip label="Current" size={ChipSize.X_SMALL} variant={ChipVariant.PRIMARY} />
        )}
      </Flex>
    ),
  } satisfies TableColumn<FunctionVersionsTableRow, number>,
  {
    id: "status",
    header: "Status",
    accessor: (row) => row.version.status,
    width: FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_STATUS,
    cell: ({ row }) => (
      <FunctionVersionStatusChip status={row.version.status} message={row.version.statusMessage} />
    ),
  } satisfies TableColumn<FunctionVersionsTableRow, number>,
  {
    id: "image",
    header: "Image",
    accessor: (row) => row.version.spec?.image ?? "",
    minWidth: FUNCTION_VERSIONS_TABLE_COLUMN_MIN_WIDTH_IMAGE,
    cell: ({ value }) => (
      <Text
        family={FontFamily.MONO}
        variant={TextVariant.SECONDARY}
        lineClamp={1}
        shouldTooltipOnOverflow
      >
        {value}
      </Text>
    ),
  } satisfies TableColumn<FunctionVersionsTableRow, string>,
  {
    id: "rootfs",
    header: "Rootfs",
    accessor: (row) => Number(row.version.rootfsBytes),
    align: "right",
    width: FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_ROOTFS,
    cell: ({ row }) => (
      <Text family={FontFamily.MONO} isTabular>
        {formatBytes(row.version.rootfsBytes)}
      </Text>
    ),
  } satisfies TableColumn<FunctionVersionsTableRow, number>,
  {
    id: "build",
    header: "Build",
    accessor: (row) =>
      row.version.buildEndedAt === 0n
        ? -1
        : Number(row.version.buildEndedAt - row.version.buildStartedAt),
    align: "right",
    width: FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_BUILD,
    cell: ({ value }) => (
      <Text family={FontFamily.MONO} isTabular>
        {value < 0 ? EMPTY_VALUE : formatMillis(value)}
      </Text>
    ),
  } satisfies TableColumn<FunctionVersionsTableRow, number>,
  {
    id: "createdAt",
    header: "Created",
    accessor: (row) => Number(row.version.createdAt),
    canSort: true,
    width: FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_CREATED_AT,
    cell: ({ row }) => (
      <Text variant={TextVariant.SECONDARY} lineClamp={1}>
        {formatTimeAgo(row.version.createdAt)}
      </Text>
    ),
  } satisfies TableColumn<FunctionVersionsTableRow, number>,
];
