import { type Invocation, InvocationStatus, StartKind } from "@/gen/functions/v1/invocations_pb";

import {
  INVOCATION_STATUS_TO_LABEL_MAP,
  INVOCATION_STATUS_TO_WIRE_TOKEN_MAP,
  INVOCATION_STATUSES,
  START_KIND_TO_WIRE_TOKEN_MAP,
  START_KINDS,
} from "@/components/invocations/constants";

import { formatMicros } from "@/utils/format";

export const mapWireTokenToInvocationStatus = (token: string) =>
  INVOCATION_STATUSES.find((status) => INVOCATION_STATUS_TO_WIRE_TOKEN_MAP[status] === token) ??
  InvocationStatus.UNSPECIFIED;

export const mapWireTokenToStartKind = (token: string) =>
  START_KINDS.find((kind) => START_KIND_TO_WIRE_TOKEN_MAP[kind] === token) ?? StartKind.UNSPECIFIED;

export const formatInvocationOutcome = (invocation: Invocation) =>
  [
    INVOCATION_STATUS_TO_LABEL_MAP[invocation.status],
    invocation.stats ? `in ${formatMicros(invocation.stats.totalUs)}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
