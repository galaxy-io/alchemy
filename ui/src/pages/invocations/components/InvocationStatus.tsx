import { InfoIcon } from "@phosphor-icons/react";

import Beacon from "@galaxy-io/dls/beacons/Beacon";
import Icon, { IconVariant } from "@galaxy-io/dls/icons/Icon";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";
import { FontFamily, Placement } from "@galaxy-io/dls/theme/enums";
import Tooltip from "@galaxy-io/dls/tooltip/Tooltip";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import InvocationStatusSwatch from "@/pages/invocations/components/InvocationStatusSwatch";
import {
  INVOCATION_STATUS_TO_HUE_MAP,
  INVOCATION_STATUS_TO_LABEL_MAP,
} from "@/pages/invocations/constants";
import { isInvocationLive } from "@/pages/invocations/utils";

interface InvocationStatusProps {
  invocation: Pick<Invocation, "status" | "error" | "platformError">;
  size?: TextSize;
}

const InvocationStatus = ({ invocation, size = TextSize.BODY_SM }: InvocationStatusProps) => {
  const reason = invocation.platformError || invocation.error?.message;

  return (
    <Flex alignItems={AlignItems.CENTER} gap={8}>
      {isInvocationLive(invocation.status) ? (
        <Beacon color={INVOCATION_STATUS_TO_HUE_MAP[invocation.status] ?? "blue"} isPulse />
      ) : (
        <InvocationStatusSwatch status={invocation.status} />
      )}
      <Text size={size} lineClamp={1}>
        {INVOCATION_STATUS_TO_LABEL_MAP[invocation.status]}
      </Text>
      {reason && (
        <Tooltip
          body={
            <Text size={TextSize.CAPTION} family={FontFamily.MONO} isSelectable>
              {reason}
            </Text>
          }
          placement={Placement.RIGHT}
        >
          <Icon component={InfoIcon} variant={IconVariant.TERTIARY} size={14} />
        </Tooltip>
      )}
    </Flex>
  );
};

export default InvocationStatus;
