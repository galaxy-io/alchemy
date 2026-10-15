import type { FC } from "react";

import Square, { type SquareSize } from "@galaxy-io/dls/shapes/Square";

import type { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import { INVOCATION_STATUS_TO_HUE_MAP } from "@/components/invocations/constants";

interface InvocationStatusSwatchProps {
  status: InvocationStatus;
  size?: SquareSize;
}

const InvocationStatusSwatch: FC<InvocationStatusSwatchProps> = ({ status, size }) => (
  <Square size={size} color={INVOCATION_STATUS_TO_HUE_MAP[status]} />
);

export default InvocationStatusSwatch;
