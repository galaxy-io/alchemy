import { InvocationProtocol } from "@/gen/functions/v1/common_pb";

export const FUNCTION_SETTINGS_PAGE_MAX_WIDTH = 640;
export const FUNCTION_SETTINGS_PAGE_DESCRIPTION_MIN_ROWS = 2;
export const FUNCTION_SETTINGS_PAGE_RUNTIME_EXPANDED_DEPTH = 2;

export const FUNCTION_SETTINGS_PAGE_PROTOCOL_TO_TOKEN_MAP: Record<InvocationProtocol, string> = {
  [InvocationProtocol.UNSPECIFIED]: "unspecified",
  [InvocationProtocol.EXEC]: "exec",
  [InvocationProtocol.RUNTIME_API]: "runtime_api",
};
