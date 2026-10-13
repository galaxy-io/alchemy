import Alert from "@galaxy-io/dls/feedback/Alert";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import { INVOCATION_STATUS_TO_ALERT_VARIANT_MAP } from "@/pages/invocations/components/drawer/constants";
import { formatInvocationOutcome } from "@/pages/invocations/components/drawer/utils";
import InvocationPhaseBar from "@/pages/invocations/components/InvocationPhaseBar";

interface InvocationDrawerOutcomeProps {
  invocation: Invocation;
}

const InvocationDrawerOutcome = ({ invocation }: InvocationDrawerOutcomeProps) => (
  <Alert
    variant={INVOCATION_STATUS_TO_ALERT_VARIANT_MAP[invocation.status]}
    header={formatInvocationOutcome(invocation)}
  >
    <Flex direction={FlexDirection.COLUMN} gap={12}>
      {invocation.error && (
        <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isSelectable>
          {invocation.error.type ? `${invocation.error.type}: ` : ""}
          {invocation.error.message}
        </Text>
      )}
      {invocation.error?.violations.map((violation) => (
        <Text
          key={violation.instancePath}
          size={TextSize.CAPTION}
          family={FontFamily.MONO}
          isSelectable
        >
          {violation.instancePath || "/"} {violation.message}
        </Text>
      ))}
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
