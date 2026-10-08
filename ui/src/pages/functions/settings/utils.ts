import type { JsonValue } from "@galaxy-io/dls/json/JsonViewer";

import type { FunctionSpec } from "@/gen/functions/v1/functions_pb";

import { FUNCTION_SETTINGS_PAGE_PROTOCOL_TO_TOKEN_MAP } from "@/pages/functions/settings/constants";

export const createFunctionSettingsRuntimeJson = (spec: FunctionSpec): JsonValue => ({
  image: spec.image,
  command: spec.command,
  env: spec.env,
  protocol: FUNCTION_SETTINGS_PAGE_PROTOCOL_TO_TOKEN_MAP[spec.protocol],
  resources: {
    vcpus: spec.resources?.vcpus ?? 0,
    memoryMib: spec.resources?.memoryMib ?? 0,
  },
  timeoutMs: Number(spec.timeoutMs),
});
