import type { JsonObject, JsonValue } from "@bufbuild/protobuf";
import { match } from "ts-pattern";

import type { ArrowContract, Contract } from "@/gen/functions/v1/common_pb";

import {
  FUNCTION_CONTRACT_SIDE_TO_ARROW_SCHEMA_KEY_MAP,
  FUNCTION_CONTRACT_SIDE_TO_JSON_SCHEMA_KEY_MAP,
} from "@/pages/functions/constants";
import {
  FUNCTION_CONTRACT_IDENTIFIER_PATTERN,
  FUNCTION_CONTRACT_SIGNATURE_INDENT,
  FUNCTION_CONTRACT_SIGNATURE_UNKNOWN_TYPE,
  FUNCTION_CONTRACT_WHITESPACE_PATTERN,
} from "@/pages/functions/contract/constants";
import type { FunctionContractSignatureField } from "@/pages/functions/contract/types";
import type { FunctionContractSide } from "@/pages/functions/types";
import { decodeFunctionArrowFields } from "@/pages/functions/utils";

import { isJsonObject } from "@/utils/json";
import { getJsonSchemaRefName } from "@/utils/jsonSchema";

const formatSignatureComment = (description: string, indent: string) =>
  `${indent}// ${description.replace(FUNCTION_CONTRACT_WHITESPACE_PATTERN, " ").trim()}`;

const formatSignatureObject = (fields: FunctionContractSignatureField[], depth: number) => {
  if (!fields.length) return "{}";
  const indent = FUNCTION_CONTRACT_SIGNATURE_INDENT.repeat(depth + 1);
  const keys = fields.map(({ name, isOptional }) => {
    const key = FUNCTION_CONTRACT_IDENTIFIER_PATTERN.test(name) ? name : JSON.stringify(name);
    return `${key}${isOptional ? "?" : ""}:`;
  });
  const width = Math.max(...keys.map((key) => key.length));
  const lines = fields.flatMap(({ type, description }, index) => [
    ...(description ? [formatSignatureComment(description, indent)] : []),
    `${indent}${keys[index]?.padEnd(width)} ${type}`,
  ]);
  return ["{", ...lines, `${FUNCTION_CONTRACT_SIGNATURE_INDENT.repeat(depth)}}`].join("\n");
};

const getJsonSchemaDescription = (schema: JsonValue) =>
  isJsonObject(schema) && typeof schema.description === "string" ? schema.description : undefined;

const formatJsonSchemaObject = (schema: JsonObject, properties: JsonObject, depth: number) => {
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return formatSignatureObject(
    Object.entries(properties).map(([name, property]) => ({
      name,
      type: formatJsonSchemaType(property, depth + 1),
      isOptional: !required.has(name),
      description: getJsonSchemaDescription(property),
    })),
    depth,
  );
};

const formatJsonSchemaArrayItem = (item: string) =>
  item.includes(" | ") ? `(${item})[]` : `${item}[]`;

const formatJsonSchemaType = (schema: JsonValue, depth: number): string => {
  if (!isJsonObject(schema)) return FUNCTION_CONTRACT_SIGNATURE_UNKNOWN_TYPE;
  const {
    type,
    items,
    $ref,
    const: constant,
    enum: options,
    oneOf,
    anyOf,
    properties,
    additionalProperties,
  } = schema;
  if (typeof $ref === "string") return getJsonSchemaRefName($ref);
  if (constant !== undefined) return JSON.stringify(constant);
  if (Array.isArray(options)) return options.map((option) => JSON.stringify(option)).join(" | ");
  const variants = Array.isArray(oneOf) ? oneOf : Array.isArray(anyOf) ? anyOf : undefined;
  if (variants) return variants.map((variant) => formatJsonSchemaType(variant, depth)).join(" | ");
  if (isJsonObject(properties)) return formatJsonSchemaObject(schema, properties, depth);
  if (Array.isArray(type)) return type.join(" | ");
  if (type === "array") {
    return formatJsonSchemaArrayItem(
      items === undefined
        ? FUNCTION_CONTRACT_SIGNATURE_UNKNOWN_TYPE
        : formatJsonSchemaType(items, depth),
    );
  }
  if (type === "object" && isJsonObject(additionalProperties)) {
    return `Record<string, ${formatJsonSchemaType(additionalProperties, depth)}>`;
  }
  return typeof type === "string" ? type : FUNCTION_CONTRACT_SIGNATURE_UNKNOWN_TYPE;
};

const decodeContractSideArrowFields = (contract: ArrowContract, side: FunctionContractSide) =>
  decodeFunctionArrowFields(contract[FUNCTION_CONTRACT_SIDE_TO_ARROW_SCHEMA_KEY_MAP[side]]);

export const createContractSideSignature = (
  contract: Contract["kind"],
  side: FunctionContractSide,
) =>
  match(contract)
    .with({ case: "jsonSchema" }, ({ value }) => {
      const schema = value[FUNCTION_CONTRACT_SIDE_TO_JSON_SCHEMA_KEY_MAP[side]] ?? {};
      const description = getJsonSchemaDescription(schema);
      const signature = formatJsonSchemaType(schema, 0);
      return description ? `${formatSignatureComment(description, "")}\n${signature}` : signature;
    })
    .with({ case: "arrow" }, ({ value }) =>
      formatSignatureObject(
        decodeContractSideArrowFields(value, side).map((field) => ({
          name: field.name,
          type: field.type,
          isOptional: field.nullable,
          description: undefined,
        })),
        0,
      ),
    )
    .with({ case: undefined }, () => FUNCTION_CONTRACT_SIGNATURE_UNKNOWN_TYPE)
    .exhaustive();

export const createContractSideJson = (
  contract: Contract["kind"],
  side: FunctionContractSide,
): JsonValue =>
  match(contract)
    .with(
      { case: "jsonSchema" },
      ({ value }) => value[FUNCTION_CONTRACT_SIDE_TO_JSON_SCHEMA_KEY_MAP[side]] ?? {},
    )
    .with({ case: "arrow" }, ({ value }) =>
      decodeContractSideArrowFields(value, side).map((field) => ({ ...field })),
    )
    .with({ case: undefined }, () => null)
    .exhaustive();
