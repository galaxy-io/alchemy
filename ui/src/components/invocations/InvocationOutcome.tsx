import type { FC } from "react";

import Alert from "@galaxy-io/dls/feedback/Alert";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import { INVOCATION_STATUS_TO_ALERT_VARIANT_MAP } from "@/components/invocations/constants";
import InvocationPhaseBar from "@/components/invocations/InvocationPhaseBar";
import { formatInvocationOutcome } from "@/components/invocations/utils";

interface InvocationOutcomeProps {
  invocation: Invocation;
}

const InvocationOutcome: FC<InvocationOutcomeProps> = ({ invocation }) => {
  const reason = invocation.platformError || invocation.error?.message;
  const violations = invocation.error?.violations ?? [];

  return (
    <Alert
      variant={INVOCATION_STATUS_TO_ALERT_VARIANT_MAP[invocation.status]}
      header={formatInvocationOutcome(invocation)}
    >
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        {reason && (
          <Flex direction={FlexDirection.COLUMN} gap={4}>
            <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isSelectable>
              {reason}
            </Text>
            {violations.map((violation) => (
              <Flex
                key={`${violation.instancePath}${violation.schemaPath}${violation.message}`}
                gap={8}
              >
                {violation.instancePath && (
                  <Text
                    size={TextSize.BODY_SM}
                    family={FontFamily.MONO}
                    variant={TextVariant.SECONDARY}
                    isSelectable
                  >
                    {violation.instancePath}
                  </Text>
                )}
                <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isSelectable>
                  {violation.message}
                </Text>
              </Flex>
            ))}
          </Flex>
        )}
        {invocation.stats && <InvocationPhaseBar stats={invocation.stats} />}
      </Flex>
    </Alert>
  );
};

export default InvocationOutcome;
