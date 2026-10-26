import type { FC } from "react";

import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import PageLayout from "@galaxy-io/dls/layout/PageLayout";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import Text, { TextSize, TextWeight } from "@galaxy-io/dls/text/Text";

import HostsCard from "@/pages/hosts/components/card/HostsCard";
import HostsInstancesTable from "@/pages/hosts/components/table/HostsInstancesTable";
import { HOSTS_CARD_WIDTH, HOSTS_SECTION_HEADER_HEIGHT } from "@/pages/hosts/constants";
import { getHostsInstances } from "@/pages/hosts/utils";

import { useSuspenseListHostsQuery } from "@/api/queries/hosts";
import { useSuspenseListInstancesQuery } from "@/api/queries/instances";

import { formatCount } from "@/utils/format";

const HostsPage: FC = () => {
  const { data: hostsData } = useSuspenseListHostsQuery();
  const { data: instancesData } = useSuspenseListInstancesQuery();

  const hosts = hostsData.hosts;
  const instances = instancesData.instances;

  return (
    <PageLayout header="Hosts">
      <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minHeight={0} fillWidth>
        {hosts.length > 0 && (
          <>
            <Flex direction={FlexDirection.COLUMN} shrink={0} minWidth={0}>
              <ScrollArea ariaLabel="Hosts" canScrollHorizontally hasFadeEdges>
                <Flex gap={12} padding={16}>
                  {hosts.map((host) => (
                    <Flex
                      key={host.hostname}
                      direction={FlexDirection.COLUMN}
                      width={HOSTS_CARD_WIDTH}
                      shrink={0}
                    >
                      <HostsCard host={host} instances={getHostsInstances(host, instances)} />
                    </Flex>
                  ))}
                </Flex>
              </ScrollArea>
            </Flex>
            <Divider />
          </>
        )}
        <Flex
          alignItems={AlignItems.CENTER}
          gap={8}
          padding={[0, 16]}
          height={HOSTS_SECTION_HEADER_HEIGHT}
          shrink={0}
        >
          <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM}>
            Instances
          </Text>
          <Chip
            label={formatCount(instances.length)}
            variant={ChipVariant.TERTIARY}
            size={ChipSize.X_SMALL}
          />
        </Flex>
        <Divider />
        <HostsInstancesTable instances={instances} />
      </Flex>
    </PageLayout>
  );
};

export default HostsPage;
