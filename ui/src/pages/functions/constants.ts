import { ChipVariant } from "@galaxy-io/dls/chips/Chip";
import { CodeEditorLanguage } from "@galaxy-io/dls/editor/CodeEditor";
import type { RoleColor } from "@galaxy-io/dls/theme/tokens/types";

import {
  type ArrowContract,
  InvocationProtocol,
  type JsonSchemaContract,
} from "@/gen/functions/v1/common_pb";
import { FunctionVersionStatus } from "@/gen/functions/v1/functions_pb";

import {
  type FunctionContractKind,
  FunctionContractSide,
  FunctionSourceKind,
} from "@/pages/functions/types";

export const FUNCTION_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;
export const FUNCTION_NAME_MAX_LENGTH = 63;
export const FUNCTION_DESCRIPTION_MAX_LENGTH = 160;

export const FUNCTION_VERSION_STATUS_TO_LABEL_MAP: Record<FunctionVersionStatus, string> = {
  [FunctionVersionStatus.UNSPECIFIED]: "Unknown",
  [FunctionVersionStatus.BUILDING]: "Building",
  [FunctionVersionStatus.READY]: "Ready",
  [FunctionVersionStatus.FAILED]: "Failed",
};

export const FUNCTION_VERSION_STATUS_TO_TONE_MAP: Record<
  FunctionVersionStatus,
  { color: RoleColor } | { variant: ChipVariant }
> = {
  [FunctionVersionStatus.UNSPECIFIED]: { variant: ChipVariant.SECONDARY },
  [FunctionVersionStatus.BUILDING]: { color: "blue" },
  [FunctionVersionStatus.READY]: { color: "success" },
  [FunctionVersionStatus.FAILED]: { color: "error" },
};

export const FUNCTION_CONTRACT_KIND_TO_LABEL_MAP: Record<FunctionContractKind, string> = {
  jsonSchema: "JSON Schema",
  arrow: "Arrow",
};

export const FUNCTION_PROTOCOL_TO_TOKEN_MAP: Record<InvocationProtocol, string> = {
  [InvocationProtocol.UNSPECIFIED]: "unspecified",
  [InvocationProtocol.EXEC]: "exec",
  [InvocationProtocol.RUNTIME_API]: "runtime_api",
};

export const FUNCTION_CONTRACT_SIDE_TO_JSON_SCHEMA_KEY_MAP = {
  [FunctionContractSide.INPUT]: "input",
  [FunctionContractSide.OUTPUT]: "output",
} as const satisfies Record<FunctionContractSide, keyof JsonSchemaContract>;

export const FUNCTION_CONTRACT_SIDE_TO_ARROW_SCHEMA_KEY_MAP = {
  [FunctionContractSide.INPUT]: "inputSchema",
  [FunctionContractSide.OUTPUT]: "outputSchema",
} as const satisfies Record<FunctionContractSide, keyof ArrowContract>;

export const FUNCTION_SOURCE_KIND_TO_LABEL_MAP: Record<FunctionSourceKind, string> = {
  [FunctionSourceKind.SOURCE]: "Code",
  [FunctionSourceKind.IMAGE]: "Image",
};

export const FUNCTION_SOURCE_KINDS = Object.values(FunctionSourceKind);

export const FUNCTION_SOURCE_EXTENSION_TO_LANGUAGE_MAP: Record<string, CodeEditorLanguage> = {
  py: CodeEditorLanguage.PYTHON,
  ts: CodeEditorLanguage.TYPESCRIPT,
  js: CodeEditorLanguage.JAVASCRIPT,
  mjs: CodeEditorLanguage.JAVASCRIPT,
  json: CodeEditorLanguage.JSON,
  md: CodeEditorLanguage.MARKDOWN,
  toml: CodeEditorLanguage.TOML,
  yaml: CodeEditorLanguage.YAML,
  yml: CodeEditorLanguage.YAML,
};
