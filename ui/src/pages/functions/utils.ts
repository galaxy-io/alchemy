import { clone, create } from "@bufbuild/protobuf";
import { Field, Schema } from "apache-arrow";
import { match } from "ts-pattern";

import { CodeEditorLanguage } from "@galaxy-io/dls/editor/CodeEditor";
import type { JsonValue } from "@galaxy-io/dls/json/JsonViewer";
import { GalaxyTheme } from "@galaxy-io/dls/theme/enums";

import {
  type Function as AlchemyFunction,
  type FunctionSpec,
  FunctionSpecSchema,
  type FunctionVersion,
  type Runtime,
  type SourceFile,
  SourceSchema,
} from "@/gen/functions/v1/functions_pb";

import {
  FUNCTION_NAME_PATTERN,
  FUNCTION_PROTOCOL_TO_TOKEN_MAP,
  FUNCTION_SOURCE_EXTENSION_TO_LANGUAGE_MAP,
} from "@/pages/functions/constants";
import type {
  FunctionArrowField,
  FunctionContractKind,
  FunctionSourceFile,
} from "@/pages/functions/types";

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
  ...(spec.source && {
    source: {
      files: spec.source.files.map(({ path, size }) => ({ path, size: Number(size) })),
      ...(spec.source.layer && {
        layer: { key: spec.source.layer.key, sha256: spec.source.layer.sha256 },
      }),
    },
  }),
});

export const getFunctionRuntime = (
  runtimes: Runtime[],
  image: string | undefined,
): Runtime | undefined => runtimes.find((runtime) => runtime.image === image);

export const getFunctionRuntimeIconUrl = (
  runtime: Runtime,
  theme: GalaxyTheme.DARK | GalaxyTheme.LIGHT,
) =>
  match(theme)
    .with(GalaxyTheme.DARK, () => runtime.darkIconUrl)
    .with(GalaxyTheme.LIGHT, () => runtime.lightIconUrl)
    .exhaustive();

export const getFunctionSourceLanguage = (path: string): CodeEditorLanguage =>
  FUNCTION_SOURCE_EXTENSION_TO_LANGUAGE_MAP[path.split(".").pop() ?? ""] ??
  CodeEditorLanguage.PLAIN;

export const decodeFunctionSourceFile = (content: Uint8Array) => new TextDecoder().decode(content);

export const encodeFunctionSourceFile = (content: string) => new TextEncoder().encode(content);

export const createFunctionSourceStarter = (
  runtime: Runtime,
  contractKind: FunctionContractKind,
): FunctionSourceFile[] => [
  {
    path: runtime.handlerPath,
    content: match(contractKind)
      .with("jsonSchema", () => runtime.starters?.jsonSchema ?? "")
      .with("arrow", () => runtime.starters?.arrow ?? "")
      .exhaustive(),
  },
];

export const decodeFunctionSourceFiles = (files: SourceFile[]): FunctionSourceFile[] =>
  files.map(({ path, content }) => ({ path, content: decodeFunctionSourceFile(content) }));

export const createFunctionSource = (files: FunctionSourceFile[]) =>
  create(SourceSchema, {
    files: files.map(({ path, content }) => ({ path, content: encodeFunctionSourceFile(content) })),
  });

export const createFunctionSourceSpec = (spec: FunctionSpec, files: FunctionSourceFile[]) => {
  const next = clone(FunctionSpecSchema, spec);
  next.source = createFunctionSource(files);
  return next;
};
