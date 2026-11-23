import { clone, create } from "@bufbuild/protobuf";
import { Schema } from "apache-arrow";
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
  FUNCTION_ENV_NAME_PATTERN,
  FUNCTION_NAME_PATTERN,
  FUNCTION_PROTOCOL_TO_TOKEN_MAP,
  FUNCTION_SOURCE_EXTENSION_TO_LANGUAGE_MAP,
  FUNCTION_SOURCE_EXTENSION_TO_RUNTIME_ID_MAP,
  FUNCTION_SOURCE_LANGUAGE_TO_EXTENSIONS_MAP,
} from "@/pages/functions/constants";
import type {
  FunctionArrowField,
  FunctionContractKind,
  FunctionEnv,
  FunctionSourceFile,
} from "@/pages/functions/types";

import {
  decodeArrowSchema,
  encodeArrowSchema,
  formatArrowField,
  parseArrowField,
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
    type: formatArrowField(field),
    nullable: field.nullable,
  }));

export const encodeFunctionArrowFields = (fields: FunctionArrowField[]) =>
  encodeArrowSchema(
    new Schema(
      fields.map(({ name, type, nullable }) => {
        const field = parseArrowField(name, type, nullable);
        if (!field) throw new Error(`Unknown Arrow type ${type}`);
        return field;
      }),
    ),
  );

export const createFunctionSpecJson = (spec: FunctionSpec): JsonValue => ({
  image: spec.image,
  command: spec.command,
  env: spec.env,
  secrets: spec.secrets,
  protocol: FUNCTION_PROTOCOL_TO_TOKEN_MAP[spec.protocol],
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

export const getFunctionVersionRuntime = (
  runtimes: Runtime[],
  version: FunctionVersion | undefined,
): Runtime | undefined =>
  version?.spec?.source ? getFunctionRuntime(runtimes, version.spec.image) : undefined;

export const getFunctionRuntimeIconUrl = (
  runtime: Pick<Runtime, "darkIconUrl" | "lightIconUrl">,
  theme: GalaxyTheme.DARK | GalaxyTheme.LIGHT,
) =>
  match(theme)
    .with(GalaxyTheme.DARK, () => runtime.darkIconUrl)
    .with(GalaxyTheme.LIGHT, () => runtime.lightIconUrl)
    .exhaustive();

const getFunctionSourceExtension = (path: string) => path.split(".").pop() ?? "";

export const getFunctionSourceLanguage = (path: string): CodeEditorLanguage =>
  FUNCTION_SOURCE_EXTENSION_TO_LANGUAGE_MAP[getFunctionSourceExtension(path)] ??
  CodeEditorLanguage.PLAIN;

export const getFunctionSourceExtensions = (path: string) =>
  FUNCTION_SOURCE_LANGUAGE_TO_EXTENSIONS_MAP[getFunctionSourceLanguage(path)];

export const getFunctionSourceRuntime = (runtimes: Runtime[], path: string) => {
  const id = FUNCTION_SOURCE_EXTENSION_TO_RUNTIME_ID_MAP[getFunctionSourceExtension(path)];
  return runtimes.find((runtime) => runtime.id === id);
};

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

export const createFunctionEnv = (spec: FunctionSpec | undefined): FunctionEnv => ({
  variables: Object.entries(spec?.env ?? {}).map(([key, value]) => ({ key, value })),
  stored: Object.keys(spec?.secrets ?? {}).map((key) => ({ key, value: "" })),
  secrets: [],
  secretNames: spec?.secrets ?? {},
});

export const getFunctionEnvHints = ({ variables, stored, secrets }: FunctionEnv) => {
  const names = [...variables, ...stored, ...secrets].map((pair) => pair.key.trim());
  return [
    variables.some((pair) => !pair.key.trim()) ? "Every variable needs a name" : undefined,
    secrets.some((pair) => !pair.key.trim()) ? "Every secret needs a name" : undefined,
    names.some((name) => name && !FUNCTION_ENV_NAME_PATTERN.test(name))
      ? "A name is letters, digits and underscores, not starting with a digit"
      : undefined,
    new Set(names).size !== names.length ? "Variable and secret names must be unique" : undefined,
    secrets.some((pair) => !pair.value) ? "Every new secret needs a value" : undefined,
  ].filter((hint) => hint !== undefined);
};

export const serializeFunctionEnv = ({ variables, stored, secrets, secretNames }: FunctionEnv) => ({
  env: Object.fromEntries(
    variables.filter((pair) => pair.key.trim()).map((pair) => [pair.key.trim(), pair.value]),
  ),
  secrets: Object.fromEntries(
    stored.filter((pair) => !pair.value).map((pair) => [pair.key, secretNames[pair.key]]),
  ),
  secretValues: Object.fromEntries(
    [...stored, ...secrets]
      .filter((pair) => pair.key.trim() && pair.value)
      .map((pair) => [pair.key.trim(), pair.value]),
  ),
});
