import { Field, Schema } from "apache-arrow";

import type { JsonValue } from "@galaxy-io/dls/json/JsonViewer";

import type {
  Function as AlchemyFunction,
  FunctionSpec,
  FunctionVersion,
} from "@/gen/functions/v1/functions_pb";

import { FUNCTION_NAME_PATTERN, FUNCTION_PROTOCOL_TO_TOKEN_MAP } from "@/pages/functions/constants";
import type { FunctionArrowField } from "@/pages/functions/types";

import {
  decodeArrowSchema,
  encodeArrowSchema,
  formatArrowType,
  parseArrowType,
} from "@/utils/arrow";
import { isJsonObject, parseJson } from "@/utils/json";

export const getFunctionCurrentVersion = (
  alchemyFunction: AlchemyFunction,
): FunctionVersion | undefined =>
  alchemyFunction.currentVersion?.id ? alchemyFunction.currentVersion : undefined;

export const getFunctionNameError = (name: string) => {
  if (!name) return "Name is required";
  return FUNCTION_NAME_PATTERN.test(name)
    ? undefined
    : "Use lowercase letters, digits and dashes, starting with a letter";
};

export const getFunctionSchemaError = (text: string) => {
  const { value, error } = parseJson(text);
  if (error) return error;
  return isJsonObject(value) ? undefined : "Enter a JSON Schema object";
};

export const decodeFunctionArrowFields = (bytes: Uint8Array): FunctionArrowField[] =>
  (decodeArrowSchema(bytes)?.fields ?? []).map((field) => ({
    name: field.name,
    type: formatArrowType(field.type),
    nullable: field.nullable,
  }));

export const encodeFunctionArrowFields = (fields: FunctionArrowField[]) =>
  encodeArrowSchema(
    new Schema(
      fields.map(({ name, type, nullable }) => {
        const dataType = parseArrowType(type);
        if (!dataType) throw new Error(`Unknown Arrow type ${type}`);
        return new Field(name, dataType, nullable);
      }),
    ),
  );

export const createFunctionSpecJson = (spec: FunctionSpec): JsonValue => ({
  image: spec.image,
  command: spec.command,
  env: spec.env,
  protocol: FUNCTION_PROTOCOL_TO_TOKEN_MAP[spec.protocol],
  resources: {
    vcpus: spec.resources?.vcpus ?? 0,
    memoryMib: spec.resources?.memoryMib ?? 0,
  },
  timeoutMs: Number(spec.timeoutMs),
});
