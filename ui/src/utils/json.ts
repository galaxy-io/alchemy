import type { JsonValue } from "@bufbuild/protobuf";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const formatJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const encodeJson = (value: JsonValue): Uint8Array => encoder.encode(JSON.stringify(value));

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
        error instanceof Error ? error.message.replace(/^JSON\.parse: /, "") : "Enter valid JSON",
    };
  }
};
