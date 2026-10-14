import Square, { type SquareSize } from "@galaxy-io/dls/shapes/Square";

import type { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import { INVOCATION_STATUS_TO_HUE_MAP } from "@/pages/invocations/constants";

interface InvocationStatusSwatchProps {
  status: InvocationStatus;
  size?: SquareSize;
}

const InvocationStatusSwatch = ({ status, size }: InvocationStatusSwatchProps) => {
  const hue = INVOCATION_STATUS_TO_HUE_MAP[status];
  return <Square {...(size ? { size } : {})} {...(hue === null ? {} : { color: hue })} />;
};

export default InvocationStatusSwatch;
