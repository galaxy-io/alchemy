import type { JsonValue } from "@bufbuild/protobuf";
import { Field, Schema } from "apache-arrow";

import type { Function as AlchemyFunction, FunctionVersion } from "@/gen/functions/v1/functions_pb";

import { FUNCTION_NAME_PATTERN } from "@/pages/functions/constants";
import type { FunctionArrowField } from "@/pages/functions/types";

import {
  decodeArrowSchema,
  encodeArrowSchema,
  formatArrowType,
  parseArrowType,
} from "@/utils/arrow";

export const formatFunctionVersion = (version: FunctionVersion["version"]) => `Version ${version}`;

/** The version Invoke runs. The API sends an empty message rather than none before a build is ready. */
export const getFunctionCurrentVersion = (fn: AlchemyFunction): FunctionVersion | undefined =>
  fn.currentVersion?.id ? fn.currentVersion : undefined;

export const getFunctionNameError = (name: string): string | undefined =>
  name === ""
    ? "Name is required"
    : FUNCTION_NAME_PATTERN.test(name)
      ? undefined
      : "Lowercase letters, digits and dashes, starting with a letter";

export const getFunctionSchemaError = (text: string): string | undefined => {
  try {
    const value = JSON.parse(text) as JsonValue;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return "Enter a JSON Schema object";
    }
    return undefined;
  } catch {
    return "Enter valid JSON";
  }
};

export const decodeFunctionArrowFields = (bytes: Uint8Array): FunctionArrowField[] =>
  (decodeArrowSchema(bytes)?.fields ?? []).map((field) => ({
    name: field.name,
    type: formatArrowType(field.type),
    nullable: field.nullable,
  }));

/** Throws on a type token `parseArrowType` does not know. */
export const encodeFunctionArrowFields = (fields: FunctionArrowField[]): Uint8Array =>
  encodeArrowSchema(
    new Schema(
      fields.map(({ name, type, nullable }) => {
        const dataType = parseArrowType(type);
        if (!dataType) throw new Error(`Unknown Arrow type ${type}`);
        return new Field(name, dataType, nullable);
      }),
    ),
  );
