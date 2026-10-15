import type { FC } from "react";

import { InfoIcon } from "@phosphor-icons/react";

import Beacon from "@galaxy-io/dls/beacons/Beacon";
import Icon, { IconVariant } from "@galaxy-io/dls/icons/Icon";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import {
  INVOCATION_STATUS_REASON_ICON_SIZE,
  INVOCATION_STATUS_TO_HUE_MAP,
  INVOCATION_STATUS_TO_LABEL_MAP,
  LIVE_INVOCATION_STATUSES,
} from "@/components/invocations/constants";
import InvocationStatusSwatch from "@/components/invocations/InvocationStatusSwatch";

interface InvocationStatusProps {
  invocation: Pick<Invocation, "status" | "error" | "platformError">;
}

const InvocationStatus: FC<InvocationStatusProps> = ({ invocation }) => {
  const reason = invocation.platformError || invocation.error?.message;
  const hue = INVOCATION_STATUS_TO_HUE_MAP[invocation.status];

  return (
    <Flex alignItems={AlignItems.CENTER} gap={8}>
      {hue && LIVE_INVOCATION_STATUSES.has(invocation.status) ? (
        <Beacon color={hue} isPulse />
      ) : (
        <InvocationStatusSwatch status={invocation.status} />
      )}
      <Text size={TextSize.BODY_SM} lineClamp={1}>
        {INVOCATION_STATUS_TO_LABEL_MAP[invocation.status]}
      </Text>
      {reason && (
        <Icon
          component={InfoIcon}
          variant={IconVariant.TERTIARY}
          size={INVOCATION_STATUS_REASON_ICON_SIZE}
          ariaLabel="Status reason"
          tooltip={
            <Text size={TextSize.CAPTION} family={FontFamily.MONO} isSelectable>
              {reason}
            </Text>
          }
        />
      )}
    </Flex>
  );
};

export default InvocationStatus;
