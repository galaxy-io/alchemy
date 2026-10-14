import { AlertVariant } from "@galaxy-io/dls/feedback/Alert";

import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

export const INVOCATION_STATUS_TO_ALERT_VARIANT_MAP: Record<InvocationStatus, AlertVariant> = {
  [InvocationStatus.UNSPECIFIED]: AlertVariant.PRIMARY,
  [InvocationStatus.PENDING]: AlertVariant.PRIMARY,
  [InvocationStatus.STARTING]: AlertVariant.PRIMARY,
  [InvocationStatus.RUNNING]: AlertVariant.PRIMARY,
  [InvocationStatus.SUCCEEDED]: AlertVariant.SUCCESS,
  [InvocationStatus.FAILED]: AlertVariant.ERROR,
  [InvocationStatus.ERRORED]: AlertVariant.WARNING,
  [InvocationStatus.CANCELED]: AlertVariant.PRIMARY,
};
