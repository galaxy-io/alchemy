import type { JsonValue } from "@bufbuild/protobuf";

const JSON_INDENT = 2;
const JSON_PARSE_PREFIX = /^JSON\.parse: /;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const formatJson = (value: unknown) => JSON.stringify(value, null, JSON_INDENT) ?? "";

export const encodeJson = (value: JsonValue) => encoder.encode(JSON.stringify(value));

export const decodeJson = (bytes: Uint8Array): JsonValue | undefined => {
  if (bytes.length === 0) return undefined;
  try {
    return JSON.parse(decoder.decode(bytes)) as JsonValue;
  } catch {
    return undefined;
  }
};

export const parseJson = (text: string): { value?: JsonValue; error?: string } => {
  try {
    return { value: JSON.parse(text) as JsonValue };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message.replace(JSON_PARSE_PREFIX, "") : "Enter valid JSON",
    };
  }
};

export const isJsonObject = (value: JsonValue | undefined): value is { [key: string]: JsonValue } =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
