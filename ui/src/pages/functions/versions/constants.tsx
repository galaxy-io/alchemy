import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import type { TableColumn } from "@galaxy-io/dls/table/types";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import { EMPTY_VALUE } from "@galaxy-io/dls/utils/format";

import RelativeTime from "@/components/RelativeTime";

import FunctionVersionStatusChip from "@/pages/functions/components/FunctionVersionStatusChip";
import type { FunctionVersionsTableRow } from "@/pages/functions/versions/types";

import { formatMillis, formatVersion } from "@/utils/format";

const FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_VERSION = 180;
const FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_STATUS = 130;
const FUNCTION_VERSIONS_TABLE_COLUMN_MIN_WIDTH_IMAGE = 240;
const FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_BUILD = 90;
const FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_CREATED_AT = 120;

export const FUNCTION_VERSIONS_DETAILS_FILE_ICON_SIZE = 12;

export const FUNCTION_VERSIONS_DETAILS_COLUMNS =
  "max-content auto minmax(0, 1fr) minmax(0, 1fr) auto";

export const FUNCTION_VERSIONS_TABLE_COLUMNS: TableColumn<FunctionVersionsTableRow>[] = [
  {
    id: "version",
    header: "Version",
    isRowHeader: true,
    width: FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_VERSION,
    cell: ({ row }) => (
      <Flex gap={8} alignItems={AlignItems.CENTER}>
        <Text size={TextSize.BODY_SM}>{formatVersion(row.version.version)}</Text>
        {row.isCurrent && (
          <Chip label="Current" size={ChipSize.X_SMALL} variant={ChipVariant.SECONDARY} />
        )}
      </Flex>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_STATUS,
    cell: ({ row }) => (
      <FunctionVersionStatusChip status={row.version.status} message={row.version.statusMessage} />
    ),
  },
  {
    id: "image",
    header: "Image",
    minWidth: FUNCTION_VERSIONS_TABLE_COLUMN_MIN_WIDTH_IMAGE,
    cell: ({ row }) => (
      <Text
        size={TextSize.BODY_SM}
        family={FontFamily.MONO}
        variant={TextVariant.SECONDARY}
        lineClamp={1}
        shouldTooltipOnOverflow
      >
        {row.version.spec?.image}
      </Text>
    ),
  },
  {
    id: "build",
    header: "Build",
    align: "right",
    width: FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_BUILD,
    cell: ({ row }) => (
      <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isTabular>
        {row.version.buildEndedAt
          ? formatMillis(row.version.buildEndedAt - row.version.buildStartedAt)
          : EMPTY_VALUE}
      </Text>
    ),
  },
  {
    id: "created",
    header: "Created",
    align: "right",
    width: FUNCTION_VERSIONS_TABLE_COLUMN_WIDTH_CREATED_AT,
    cell: ({ row }) => <RelativeTime unixMillis={row.version.createdAt} />,
  },
];
