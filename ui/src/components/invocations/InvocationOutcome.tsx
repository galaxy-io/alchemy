import type { FC } from "react";

import Alert from "@galaxy-io/dls/feedback/Alert";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import { INVOCATION_STATUS_TO_ALERT_VARIANT_MAP } from "@/components/invocations/constants";
import InvocationPhaseBar from "@/components/invocations/InvocationPhaseBar";
import { formatInvocationOutcome } from "@/components/invocations/utils";

interface InvocationOutcomeProps {
  invocation: Invocation;
}

const InvocationOutcome: FC<InvocationOutcomeProps> = ({ invocation }) => (
  <Alert
    variant={INVOCATION_STATUS_TO_ALERT_VARIANT_MAP[invocation.status]}
    header={formatInvocationOutcome(invocation)}
  >
    {invocation.stats && <InvocationPhaseBar stats={invocation.stats} />}
  </Alert>
);

export default InvocationOutcome;
