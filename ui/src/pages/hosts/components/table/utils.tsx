import type { TableColumn } from "@galaxy-io/dls/table/types";
import Text, { TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import type { Instance } from "@/gen/functions/v1/host_pb";

import HostInstanceStatus from "@/pages/hosts/components/HostInstanceStatus";
import {
  HOSTS_INSTANCES_TABLE_COLUMN_ID_STATUS,
  HOSTS_INSTANCES_TABLE_COLUMN_MIN_WIDTH_FUNCTION,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_AGE,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_HOST,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_INSTANCE,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_STATUS,
} from "@/pages/hosts/components/table/constants";
import { INSTANCE_STATUS_TO_LABEL_MAP } from "@/pages/hosts/constants";

import { formatTimeAgo } from "@/utils/format";

export const createHostsInstancesTableColumns = (
  functionNameById: ReadonlyMap<AlchemyFunction["id"], AlchemyFunction["name"]>,
): TableColumn<Instance>[] => [
  {
    id: HOSTS_INSTANCES_TABLE_COLUMN_ID_STATUS,
    header: "Status",
    accessor: (row) => INSTANCE_STATUS_TO_LABEL_MAP[row.status],
    canSort: true,
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_STATUS,
    cell: ({ row }) => <HostInstanceStatus status={row.status} />,
  } satisfies TableColumn<Instance, string>,
  {
    id: "function",
    header: "Function",
    accessor: (row) => functionNameById.get(row.functionId) ?? row.functionId,
    isRowHeader: true,
    canSort: true,
    minWidth: HOSTS_INSTANCES_TABLE_COLUMN_MIN_WIDTH_FUNCTION,
    cell: ({ value }) => <Text lineClamp={1}>{value}</Text>,
  } satisfies TableColumn<Instance, string>,
  {
    id: "id",
    header: "Instance",
    accessor: (row) => row.id,
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_INSTANCE,
    cell: ({ value }) => (
      <Text family={FontFamily.MONO} variant={TextVariant.SECONDARY} lineClamp={1}>
        {value}
      </Text>
    ),
  } satisfies TableColumn<Instance, string>,
  {
    id: "host",
    header: "Host",
    accessor: (row) => row.host,
    canSort: true,
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_HOST,
    cell: ({ value }) => (
      <Text family={FontFamily.MONO} variant={TextVariant.SECONDARY} lineClamp={1}>
        {value}
      </Text>
    ),
  } satisfies TableColumn<Instance, string>,
  {
    id: "startedAt",
    header: "Age",
    accessor: (row) => Number(row.startedAt),
    align: "right",
    canSort: true,
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_AGE,
    cell: ({ row }) => <Text variant={TextVariant.SECONDARY}>{formatTimeAgo(row.startedAt)}</Text>,
  } satisfies TableColumn<Instance, number>,
];
