import type { FC } from "react";

import Alert from "@galaxy-io/dls/feedback/Alert";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextWeight } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import { FUNCTION_ERROR_KIND_TO_LABEL_MAP } from "@/components/invocations/constants";
import InvocationError from "@/components/invocations/InvocationError";
import InvocationPhaseBar from "@/components/invocations/InvocationPhaseBar";
import { formatInvocationOutcome } from "@/components/invocations/utils";

import { INVOCATION_DRAWER_STATUS_TO_ALERT_VARIANT_MAP } from "@/pages/invocations/components/drawer/constants";

interface InvocationDrawerOutcomeProps {
  invocation: Invocation;
}

const InvocationDrawerOutcome: FC<InvocationDrawerOutcomeProps> = ({ invocation }) => (
  <Alert
    variant={INVOCATION_DRAWER_STATUS_TO_ALERT_VARIANT_MAP[invocation.status]}
    header={formatInvocationOutcome(invocation)}
  >
    <Flex direction={FlexDirection.COLUMN} gap={12}>
      {invocation.error && (
        <Text size={TextSize.BODY_SM} weight={TextWeight.MEDIUM}>
          {FUNCTION_ERROR_KIND_TO_LABEL_MAP[invocation.error.kind]}
        </Text>
      )}
      {invocation.error && <InvocationError error={invocation.error} />}
      {invocation.platformError && (
        <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isSelectable>
          {invocation.platformError}
        </Text>
      )}
      {invocation.stats && <InvocationPhaseBar stats={invocation.stats} />}
    </Flex>
  </Alert>
);

export default InvocationDrawerOutcome;
