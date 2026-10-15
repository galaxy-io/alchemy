import type { JsonObject, JsonValue } from "@bufbuild/protobuf";
import type { Schema } from "apache-arrow";
import { match } from "ts-pattern";

import type { Contract } from "@/gen/functions/v1/common_pb";
import type { FunctionVersion } from "@/gen/functions/v1/functions_pb";

import { createContractSideJson } from "@/pages/functions/contract/utils";
import { FunctionContractSide } from "@/pages/functions/types";
import { createFunctionSpecJson } from "@/pages/functions/utils";
import {
  FUNCTION_WORKBENCH_DEFAULT_INPUT,
  FUNCTION_WORKBENCH_FILES,
} from "@/pages/functions/workbench/constants";
import { FunctionWorkbenchFile } from "@/pages/functions/workbench/types";

import {
  createArrowSampleRows,
  decodeArrowRows,
  decodeArrowSchema,
  encodeArrowRows,
} from "@/utils/arrow";
import { decodeJson, encodeJson, formatJson, isJsonObject } from "@/utils/json";
import { createJsonSchemaSample } from "@/utils/jsonSchema";

export const isFunctionWorkbenchFile = (id: string): id is FunctionWorkbenchFile =>
  FUNCTION_WORKBENCH_FILES.some((file) => file === id);

export const getFunctionWorkbenchArrowSchema = (contract: Contract | undefined) =>
  contract?.kind.case === "arrow" ? decodeArrowSchema(contract.kind.value.inputSchema) : undefined;

export const createFunctionWorkbenchDefaultInput = (
  contract: Contract | undefined,
  arrowSchema: Schema | undefined,
): JsonValue => {
  if (arrowSchema) return createArrowSampleRows(arrowSchema);
  if (contract?.kind.case === "jsonSchema") {
    return createJsonSchemaSample(contract.kind.value.input) ?? FUNCTION_WORKBENCH_DEFAULT_INPUT;
  }
  return FUNCTION_WORKBENCH_DEFAULT_INPUT;
};

export const getFunctionWorkbenchInputError = (
  value: JsonValue | undefined,
  arrowSchema: Schema | undefined,
) =>
  arrowSchema && !(Array.isArray(value) && value.every(isJsonObject))
    ? "Enter an array of rows"
    : undefined;

export const encodeFunctionWorkbenchInput = (value: JsonValue, arrowSchema: Schema | undefined) =>
  arrowSchema ? encodeArrowRows(arrowSchema, value as JsonObject[]) : encodeJson(value);

export const decodeFunctionWorkbenchOutput = (bytes: Uint8Array, contract: Contract | undefined) =>
  contract?.kind.case === "arrow" ? decodeArrowRows(bytes) : decodeJson(bytes);

export const formatFunctionWorkbenchReadOnlyFile = (
  file: Exclude<FunctionWorkbenchFile, FunctionWorkbenchFile.INPUT>,
  version: FunctionVersion | undefined,
) => {
  const contract = version?.spec?.contract?.kind;
  return formatJson(
    match(file)
      .with(FunctionWorkbenchFile.CONTRACT_INPUT, () =>
        contract ? createContractSideJson(contract, FunctionContractSide.INPUT) : null,
      )
      .with(FunctionWorkbenchFile.CONTRACT_OUTPUT, () =>
        contract ? createContractSideJson(contract, FunctionContractSide.OUTPUT) : null,
      )
      .with(FunctionWorkbenchFile.SPEC, () =>
        version?.spec ? createFunctionSpecJson(version.spec) : null,
      )
      .exhaustive(),
  );
};
