import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import {
  FUNCTION_ERROR_KIND_TO_LABEL_MAP,
  INVOCATION_STATUS_TO_LABEL_MAP,
} from "@/pages/invocations/constants";

import { PUBLIC_API_URL } from "@/constants";

import { formatMicros } from "@/utils/format";

export const formatInvocationOutcome = (invocation: Invocation): string =>
  [
    INVOCATION_STATUS_TO_LABEL_MAP[invocation.status],
    invocation.stats ? `in ${formatMicros(Number(invocation.stats.totalUs))}` : null,
    invocation.error ? `· ${FUNCTION_ERROR_KIND_TO_LABEL_MAP[invocation.error.kind]}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

export const createInvocationCurl = (invocation: Invocation): string =>
  [
    `curl -X POST ${PUBLIC_API_URL}/functions.v1.FunctionsService/Invoke \\`,
    `  -H 'Authorization: Bearer $ALCHEMY_API_KEY' -H 'Content-Type: application/json' \\`,
    `  -d '${JSON.stringify({
      functionId: invocation.functionId,
      version: Number(invocation.version),
      input: "<base64 input>",
    })}'`,
  ].join("\n");
