import type { FC } from "react";

import { styled } from "@linaria/react";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import { FOCUS_RING, HAIRLINE_BORDER } from "@galaxy-io/dls/styles/mixins";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { t } from "@galaxy-io/dls/theme/tokens/t";
import Tooltip from "@galaxy-io/dls/tooltip/Tooltip";

import type { Instance } from "@/gen/functions/v1/host_pb";

import FunctionName from "@/components/functions/FunctionName";

import { HOSTS_SLOT_HEIGHT } from "@/pages/hosts/constants";

const Slot = styled.button`
  ${HAIRLINE_BORDER}
  ${FOCUS_RING}
  flex: 1 1 0;
  min-width: 0;
  height: ${HOSTS_SLOT_HEIGHT}px;
  padding: 0;
  border-radius: ${t.radius.sm};
  background: ${t.color.background.secondary};
  transition: background-color ${t.duration.fast};

  &[data-busy="true"] {
    border-color: ${t.color.border.blue};
    background: ${t.color.background.blue};
    cursor: pointer;
  }
`;

interface HostsCardSlotProps {
  index: number;
  isBusy: boolean;
  instance: Instance | undefined;
  onSelect: (instance: Instance) => void;
}

const HostsCardSlot: FC<HostsCardSlotProps> = ({ index, isBusy, instance, onSelect }) => {
  const label = `Slot ${index + 1}`;

  if (!isBusy || !instance) {
    return <Slot type="button" aria-label={`${label}, idle`} data-busy={isBusy} disabled />;
  }

  return (
    <Tooltip
      body={
        <Flex direction={FlexDirection.COLUMN} gap={2}>
          <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
            {label}
          </Text>
          <FunctionName functionId={instance.functionId} />
        </Flex>
      }
    >
      <Slot
        type="button"
        aria-label={`${label}, busy`}
        data-busy={isBusy}
        onClick={() => onSelect(instance)}
      />
    </Tooltip>
  );
};

export default HostsCardSlot;
