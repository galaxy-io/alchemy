import type { FC } from "react";

import { CpuIcon } from "@phosphor-icons/react";

import EmptyLayout from "@galaxy-io/dls/layout/EmptyLayout";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import InfiniteTable from "@galaxy-io/dls/table/InfiniteTable";
import type { TableColumn } from "@galaxy-io/dls/table/types";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { Instance } from "@/gen/functions/v1/host_pb";

import FunctionName from "@/components/functions/FunctionName";
import InvocationStartKind from "@/components/invocations/InvocationStartKind";
import RelativeTime from "@/components/RelativeTime";

import HostsInstanceStatus from "@/pages/hosts/components/HostsInstanceStatus";
import {
  HOSTS_INSTANCES_TABLE_COLUMN_MIN_WIDTH_FUNCTION,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_AGE,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_MEMORY,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_START,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_STATUS,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_VCPUS,
  HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_VERSION,
} from "@/pages/hosts/components/table/constants";

import { formatCount, formatMemory, formatVersion } from "@/utils/format";

const renderMono = (value: string) => (
  <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isTabular lineClamp={1}>
    {value}
  </Text>
);

const HOSTS_INSTANCES_TABLE_COLUMNS: TableColumn<Instance>[] = [
  {
    id: "status",
    header: "Status",
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_STATUS,
    cell: ({ row }) => <HostsInstanceStatus status={row.status} />,
  },
  {
    id: "function",
    header: "Function",
    minWidth: HOSTS_INSTANCES_TABLE_COLUMN_MIN_WIDTH_FUNCTION,
    isRowHeader: true,
    cell: ({ row }) => <FunctionName functionId={row.functionId} />,
  },
  {
    id: "version",
    header: "Version",
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_VERSION,
    cell: ({ row }) => (
      <Text size={TextSize.BODY_SM} lineClamp={1}>
        {formatVersion(row.version)}
      </Text>
    ),
  },
  {
    id: "start",
    header: "Start",
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_START,
    cell: ({ row }) => <InvocationStartKind startKind={row.startKind} />,
  },
  {
    id: "vcpus",
    header: "vCPU",
    align: "right",
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_VCPUS,
    cell: ({ row }) => renderMono(formatCount(row.vcpus)),
  },
  {
    id: "memory",
    header: "Memory",
    align: "right",
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_MEMORY,
    cell: ({ row }) => renderMono(formatMemory(row.memoryMib)),
  },
  {
    id: "age",
    header: "Age",
    width: HOSTS_INSTANCES_TABLE_COLUMN_WIDTH_AGE,
    align: "right",
    cell: ({ row }) => <RelativeTime unixMillis={row.startedAt} />,
  },
];

interface HostsInstancesTableProps {
  instances: Instance[];
}

const HostsInstancesTable: FC<HostsInstancesTableProps> = ({ instances }) => (
  <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minHeight={0} fillWidth>
    <InfiniteTable<Instance>
      ariaLabel="Instances"
      columns={HOSTS_INSTANCES_TABLE_COLUMNS}
      data={instances}
      getRowId={(instance) => instance.id}
      emptyState={<EmptyLayout icon={CpuIcon} header="No instances" />}
    />
  </Flex>
);

export default HostsInstancesTable;
