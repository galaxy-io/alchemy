import { useMemo } from "react";

import { CpuIcon } from "@phosphor-icons/react";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import InfiniteTable from "@galaxy-io/dls/table/InfiniteTable";

import type { Instance } from "@/gen/functions/v1/host_pb";

import EmptyLayout from "@/layouts/EmptyLayout";

import {
  HOSTS_INSTANCES_TABLE_COLUMN_ID_STATUS,
  HOSTS_INSTANCES_TABLE_HEADER_HEIGHT,
  HOSTS_INSTANCES_TABLE_MAX_HEIGHT,
  HOSTS_INSTANCES_TABLE_ROW_HEIGHT,
} from "@/pages/hosts/components/table/constants";
import { createHostsInstancesTableColumns } from "@/pages/hosts/components/table/utils";

import { useSuspenseListFunctionsQuery } from "@/api/queries/functions";

import { useAlchemySearchUpdate } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";

interface HostsInstancesTableProps {
  instances: Instance[];
}

const HostsInstancesTable = ({ instances }: HostsInstancesTableProps) => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const { data: functionsData } = useSuspenseListFunctionsQuery();

  const columns = useMemo(
    () =>
      createHostsInstancesTableColumns(
        new Map(functionsData.functions.map((fn) => [fn.id, fn.name] as const)),
      ),
    [functionsData],
  );

  const handleRowClick = (instance: Instance) => {
    if (!instance.invocationId) return;
    void updateSearch((prev) => ({ ...prev, invocationId: instance.invocationId }));
  };

  return (
    <Flex
      direction={FlexDirection.COLUMN}
      height={Math.min(
        HOSTS_INSTANCES_TABLE_MAX_HEIGHT,
        HOSTS_INSTANCES_TABLE_HEADER_HEIGHT + instances.length * HOSTS_INSTANCES_TABLE_ROW_HEIGHT,
      )}
    >
      <InfiniteTable<Instance>
        ariaLabel="Instances"
        columns={columns}
        data={instances}
        getRowId={(row) => row.id}
        defaultSort={{ columnId: HOSTS_INSTANCES_TABLE_COLUMN_ID_STATUS, isDescending: false }}
        onRowClick={handleRowClick}
        emptyState={<EmptyLayout icon={CpuIcon} header="No instances" />}
      />
    </Flex>
  );
};

export default HostsInstancesTable;
