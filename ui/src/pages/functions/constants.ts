import type { RoleColor } from "@galaxy-io/dls/theme/tokens/types";

import { InvocationProtocol } from "@/gen/functions/v1/common_pb";
import { FunctionVersionStatus } from "@/gen/functions/v1/functions_pb";

import type { FunctionContractKind } from "@/pages/functions/types";

export const FUNCTION_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;
export const FUNCTION_NAME_MAX_LENGTH = 63;
export const FUNCTION_DESCRIPTION_MAX_LENGTH = 160;

export const FUNCTION_VERSION_STATUS_TO_LABEL_MAP: Record<FunctionVersionStatus, string> = {
  [FunctionVersionStatus.UNSPECIFIED]: "Unknown",
  [FunctionVersionStatus.BUILDING]: "Building",
  [FunctionVersionStatus.READY]: "Ready",
  [FunctionVersionStatus.FAILED]: "Failed",
};

export const FUNCTION_VERSION_STATUS_TO_HUE_MAP: Record<FunctionVersionStatus, RoleColor | null> = {
  [FunctionVersionStatus.UNSPECIFIED]: null,
  [FunctionVersionStatus.BUILDING]: "blue",
  [FunctionVersionStatus.READY]: "success",
  [FunctionVersionStatus.FAILED]: "error",
};

export const INVOCATION_PROTOCOL_TO_LABEL_MAP: Record<InvocationProtocol, string> = {
  [InvocationProtocol.UNSPECIFIED]: "Unknown",
  [InvocationProtocol.EXEC]: "Exec",
  [InvocationProtocol.RUNTIME_API]: "Runtime API",
};

export const INVOCATION_PROTOCOL_TO_DESCRIPTION_MAP: Record<InvocationProtocol, string> = {
  [InvocationProtocol.UNSPECIFIED]: "",
  [InvocationProtocol.EXEC]:
    "One process per invocation. Input on stdin, output on stdout, non-zero exit is a failure. No SDK; pays process start on every call.",
  [InvocationProtocol.RUNTIME_API]:
    "One long-lived process that pulls invocations from the supervisor's local endpoint. Initialisation happens once and is captured by the snapshot.",
};

export const FUNCTION_CONTRACT_KIND_TO_LABEL_MAP: Record<FunctionContractKind, string> = {
  jsonSchema: "JSON Schema",
  arrow: "Arrow",
};
