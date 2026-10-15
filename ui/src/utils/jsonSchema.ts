import type { JsonObject, JsonValue } from "@bufbuild/protobuf";

import { isJsonObject } from "@/utils/json";

const JSON_SCHEMA_SAMPLE_MAX_DEPTH = 8;
const JSON_SCHEMA_REF_PATTERN = /^#\/(\$defs|definitions)\/(.+)$/;

const JSON_SCHEMA_TYPE_TO_SAMPLE_MAP: Record<string, JsonValue> = {
  string: "example",
  integer: 1,
  number: 0.5,
  boolean: true,
  null: null,
};

const JSON_SCHEMA_FORMAT_TO_SAMPLE_MAP: Record<string, string> = {
  "date-time": "2026-01-01T00:00:00Z",
  date: "2026-01-01",
  time: "00:00:00Z",
  email: "user@example.com",
  uri: "https://example.com",
  uuid: "00000000-0000-0000-0000-000000000000",
};

export const getJsonSchemaRefName = (ref: string) => ref.match(JSON_SCHEMA_REF_PATTERN)?.[2] ?? ref;

const resolveJsonSchemaRef = (ref: string, root: JsonObject) => {
  const [, defsKey, name] = ref.match(JSON_SCHEMA_REF_PATTERN) ?? [];
  if (!defsKey || !name) return undefined;
  const defs = root[defsKey];
  return isJsonObject(defs) ? defs[name] : undefined;
};

const getJsonSchemaVariants = (schema: JsonObject) =>
  [schema.oneOf, schema.anyOf, schema.allOf].find(
    (variants): variants is JsonValue[] => Array.isArray(variants) && variants.length > 0,
  );

const createSample = (
  schema: JsonValue | undefined,
  root: JsonObject,
  depth: number,
): JsonValue => {
  if (!isJsonObject(schema) || depth > JSON_SCHEMA_SAMPLE_MAX_DEPTH) return null;
  const { examples, default: fallback, const: constant, enum: options, $ref } = schema;
  if (Array.isArray(examples) && examples.length) return examples[0] ?? null;
  if (fallback !== undefined) return fallback;
  if (constant !== undefined) return constant;
  if (Array.isArray(options) && options.length) return options[0] ?? null;
  if (typeof $ref === "string")
    return createSample(resolveJsonSchemaRef($ref, root), root, depth + 1);
  const variants = getJsonSchemaVariants(schema);
  if (variants) return createSample(variants[0], root, depth + 1);

  const type = Array.isArray(schema.type)
    ? schema.type.find((candidate) => candidate !== "null")
    : schema.type;
  if (type === "object" || isJsonObject(schema.properties)) {
    const properties = isJsonObject(schema.properties) ? schema.properties : {};
    return Object.fromEntries(
      Object.entries(properties).map(([name, property]) => [
        name,
        createSample(property, root, depth + 1),
      ]),
    );
  }
  if (type === "array") {
    return schema.items === undefined ? [] : [createSample(schema.items, root, depth + 1)];
  }
  if (type === "string" && typeof schema.format === "string") {
    return JSON_SCHEMA_FORMAT_TO_SAMPLE_MAP[schema.format] ?? JSON_SCHEMA_TYPE_TO_SAMPLE_MAP.string;
  }
  if ((type === "integer" || type === "number") && typeof schema.minimum === "number") {
    return schema.minimum;
  }
  return typeof type === "string" ? (JSON_SCHEMA_TYPE_TO_SAMPLE_MAP[type] ?? null) : null;
};

export const createJsonSchemaSample = (schema: JsonValue | undefined) =>
  isJsonObject(schema) ? createSample(schema, schema, 0) : null;
