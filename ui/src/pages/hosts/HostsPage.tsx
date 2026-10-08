import { useMemo } from "react";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";
import Widget from "@galaxy-io/dls/widget/Widget";

import PageLayout from "@/layouts/page/PageLayout";

import HostCard from "@/pages/hosts/components/card/HostCard";
import HostsInstancesTable from "@/pages/hosts/components/table/HostsInstancesTable";
import { HOSTS_CARD_MIN_WIDTH } from "@/pages/hosts/constants";
import { countInstancesByHost } from "@/pages/hosts/utils";

import { useGetHostQuery } from "@/api/queries/hosts";
import { useSuspenseListInstancesQuery } from "@/api/queries/instances";

const HostsPage = () => {
  const { data: hostData } = useGetHostQuery();
  const { data: instancesData } = useSuspenseListInstancesQuery();

  const instanceCountByHost = useMemo(
    () => countInstancesByHost(instancesData.instances),
    [instancesData.instances],
  );

  return (
    <PageLayout title="Hosts">
      <Flex direction={FlexDirection.COLUMN} gap={12} padding={16}>
        <Grid columns={`repeat(auto-fit, minmax(${HOSTS_CARD_MIN_WIDTH}px, 1fr))`} gap={12}>
          {hostData?.host && (
            <HostCard
              host={hostData.host}
              instanceCount={instanceCountByHost.get(hostData.host.hostname) ?? 0}
            />
          )}
        </Grid>
        <Widget header="Instances" isFlush gap={0}>
          <HostsInstancesTable instances={instancesData.instances} />
        </Widget>
      </Flex>
    </PageLayout>
  );
};

export default HostsPage;
