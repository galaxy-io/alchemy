import ProgressBar, { ProgressBarSize } from "@galaxy-io/dls/feedback/ProgressBar";
import Flex, { FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
import { FontFamily, Radius } from "@galaxy-io/dls/theme/enums";
import Widget from "@galaxy-io/dls/widget/Widget";

import type { Host } from "@/gen/functions/v1/host_pb";

import KeyValueList from "@/components/KeyValueList";
import KeyValueRow from "@/components/KeyValueRow";

import { getHostSlotsPercent } from "@/pages/hosts/utils";

import { formatMib, formatTimeAgo } from "@/utils/format";

interface HostCardProps {
  host: Host;
  instanceCount: number;
}

const HostCard = ({ host, instanceCount }: HostCardProps) => {
  return (
    <Widget header={host.hostname}>
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        <Flex direction={FlexDirection.COLUMN} gap={8} hasBorder radius={Radius.LG} padding={12}>
          <Flex justifyContent={JustifyContent.SPACE_BETWEEN}>
            <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM}>
              Slots
            </Text>
            <Text
              size={TextSize.BODY_SM}
              family={FontFamily.MONO}
              variant={TextVariant.SECONDARY}
              isTabular
            >
              {host.slotsInUse} / {host.slots}
            </Text>
          </Flex>
          <ProgressBar
            ariaLabel="Slots in use"
            value={getHostSlotsPercent(host)}
            size={ProgressBarSize.SMALL}
          />
        </Flex>
        <KeyValueList>
          <KeyValueRow label="Instances" value={instanceCount} isMono />
          <KeyValueRow label="Memory" value={formatMib(Number(host.memoryMibCommitted))} isMono />
          <KeyValueRow label="Firecracker" value={host.firecrackerVersion} isMono />
          <KeyValueRow label="Started" value={formatTimeAgo(host.startedAt)} />
        </KeyValueList>
      </Flex>
    </Widget>
  );
};

export default HostCard;
