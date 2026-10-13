import type { JsonObject, JsonValue } from "@bufbuild/protobuf";
import type { Schema } from "apache-arrow";

import type { Contract } from "@/gen/functions/v1/common_pb";
import { type FunctionVersion, FunctionVersionStatus } from "@/gen/functions/v1/functions_pb";

import { FUNCTION_WORKBENCH_DEFAULT_INPUT } from "@/pages/functions/workbench/constants";

import {
  createArrowSampleRows,
  decodeArrowRows,
  decodeArrowSchema,
  encodeArrowRows,
} from "@/utils/arrow";
import { decodeJson, encodeJson } from "@/utils/json";

/** The requested version, else the current one (the newest READY), else the newest. */
export const getFunctionWorkbenchVersion = (
  versions: FunctionVersion[],
  requestedVersion: FunctionVersion["version"] | undefined,
): FunctionVersion | undefined =>
  (requestedVersion === undefined
    ? undefined
    : versions.find((version) => version.version === requestedVersion)) ??
  versions.find((version) => version.status === FunctionVersionStatus.READY) ??
  versions[0];

/** The input schema of an Arrow contract; a JSON Schema contract takes plain JSON. */
export const getFunctionWorkbenchArrowSchema = (
  contract: Contract | undefined,
): Schema | undefined =>
  contract?.kind.case === "arrow" ? decodeArrowSchema(contract.kind.value.inputSchema) : undefined;

export const createFunctionWorkbenchDefaultInput = (arrowSchema: Schema | undefined): JsonValue =>
  arrowSchema ? createArrowSampleRows(arrowSchema) : FUNCTION_WORKBENCH_DEFAULT_INPUT;

const isJsonObject = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const getFunctionWorkbenchInputError = (
  value: JsonValue | undefined,
  arrowSchema: Schema | undefined,
): string | undefined =>
  arrowSchema && !(Array.isArray(value) && value.every(isJsonObject))
    ? "Enter an array of rows"
    : undefined;

/** Arrow contracts take one record batch; the rows are checked by `getFunctionWorkbenchInputError`. */
export const encodeFunctionWorkbenchInput = (
  value: JsonValue,
  arrowSchema: Schema | undefined,
): Uint8Array =>
  arrowSchema ? encodeArrowRows(arrowSchema, value as JsonObject[]) : encodeJson(value);

export const decodeFunctionWorkbenchOutput = (
  bytes: Uint8Array,
  contract: Contract | undefined,
): JsonValue | undefined =>
  contract?.kind.case === "arrow" ? decodeArrowRows(bytes) : decodeJson(bytes);
