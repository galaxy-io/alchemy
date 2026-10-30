import type { FC } from "react";

import { CpuIcon } from "@phosphor-icons/react";

import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { formatBytes, formatDuration } from "@galaxy-io/dls/utils/format";
import Widget from "@galaxy-io/dls/widget/Widget";

import type { Host, Instance } from "@/gen/functions/v1/host_pb";

import Stat from "@/components/Stat";

import HostsCardSlot from "@/pages/hosts/components/card/HostsCardSlot";
import { HOSTS_CARD_STATS_COLUMNS } from "@/pages/hosts/constants";
import {
  getHostsBusyInstances,
  getHostsFirecrackerVersion,
  getHostsKernelName,
} from "@/pages/hosts/utils";

import { useAlchemySearchUpdate } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";

import { formatCount, formatMemory } from "@/utils/format";

interface HostsCardProps {
  host: Host;
  instances: Instance[];
}

const HostsCard: FC<HostsCardProps> = ({ host, instances }) => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();

  const busyInstances = getHostsBusyInstances(instances);
  const slots = Array.from({ length: host.slots }, (_, index) => index);

  const handleSelect = (instance: Instance) => {
    void updateSearch((prev) => ({ ...prev, invocationId: instance.invocationId }));
  };

  return (
    <Widget header={host.hostname} icon={CpuIcon} isFlush gap={0}>
      <Flex direction={FlexDirection.COLUMN} gap={8} padding={12}>
        <Flex justifyContent={JustifyContent.SPACE_BETWEEN}>
          <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
            Slots
          </Text>
          <Text size={TextSize.CAPTION} variant={TextVariant.SECONDARY} isTabular>
            {`${host.slotsInUse}/${host.slots} busy`}
          </Text>
        </Flex>
        <Flex gap={4}>
          {slots.map((index) => (
            <HostsCardSlot
              key={index}
              index={index}
              isBusy={index < host.slotsInUse}
              instance={busyInstances[index]}
              onSelect={handleSelect}
            />
          ))}
        </Flex>
      </Flex>
      <Divider />
      <Grid columns={HOSTS_CARD_STATS_COLUMNS} gap={12} padding={12}>
        <Stat label="Instances" value={formatCount(instances.length)} />
        <Stat label="Memory" value={formatMemory(host.memoryMibCommitted)} />
        <Stat label="Cached images" value={formatCount(host.rootfsCacheImages)} />
        <Stat label="Rootfs cache" value={formatBytes(host.rootfsCacheBytes, { binary: true })} />
        <Stat label="Uptime" value={formatDuration(Date.now() - Number(host.startedAt))} />
        <Stat label="Firecracker" value={getHostsFirecrackerVersion(host.firecrackerVersion)} />
        <Stat label="Kernel" value={getHostsKernelName(host.kernel)} />
      </Grid>
    </Widget>
  );
};

export default HostsCard;
