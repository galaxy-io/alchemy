import type { JsonValue } from "@bufbuild/protobuf";
import { match } from "ts-pattern";

import { formatBytes } from "@galaxy-io/dls/utils/format";

import { Network } from "@/gen/functions/v1/common_pb";
import type {
  Function as AlchemyFunction,
  FunctionVersion,
  Runtime,
  SourceLimits,
} from "@/gen/functions/v1/functions_pb";
import type { Template } from "@/gen/functions/v1/templates_pb";

import { getFunctionRuntime } from "@/components/functions/utils";

import {
  CREATE_FUNCTION_MODAL_CONTRACT_DEFAULT_CALLER,
  CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP,
  CREATE_FUNCTION_MODAL_CONTRACT_SIDES,
  CREATE_FUNCTION_MODAL_DEFAULT_STATE,
  CREATE_FUNCTION_MODAL_IMAGE_PATTERN,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN,
  CREATE_FUNCTION_MODAL_MODE_TO_SKIPPED_STEPS_MAP,
  CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_SKIPPED_STEPS_MAP,
  CREATE_FUNCTION_MODAL_STEPS,
  CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS,
  CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS,
  CREATE_FUNCTION_MODAL_VCPUS_MAX,
  CREATE_FUNCTION_MODAL_VCPUS_MIN,
} from "@/pages/functions/components/create/constants";
import {
  type CreateFunctionModalDerivedState,
  type CreateFunctionModalFlowSeed,
  CreateFunctionModalMode,
  type CreateFunctionModalState,
  CreateFunctionModalStep,
  type CreateFunctionModalTemplateSnapshot,
} from "@/pages/functions/components/create/types";
import {
  FUNCTION_CONTRACT_KIND_TO_LABEL_MAP,
  FUNCTION_SOURCE_KIND_TO_LABEL_MAP,
} from "@/pages/functions/constants";
import {
  type FunctionArrowField,
  type FunctionContractKind,
  FunctionContractSide,
  FunctionSourceKind,
} from "@/pages/functions/types";
import {
  createFunctionEnv,
  createFunctionSourceStarter,
  decodeFunctionArrowFields,
  decodeFunctionSourceFiles,
  encodeFunctionSourceFile,
  getFunctionEnvHints,
} from "@/pages/functions/utils";

import type { AlchemyFlowContract } from "@/module/schemas";

import { parseArrowType } from "@/utils/arrow";
import { formatMemory, formatMillis } from "@/utils/format";
import { formatJson, isJsonObject, parseJson } from "@/utils/json";

export interface CreateFunctionModalSeed {
  alchemyFunction: AlchemyFunction | undefined;
  version: FunctionVersion | undefined;
  runtimes: Runtime[];
  limits: SourceLimits | undefined;
  templates: Template[];
  flowSeed?: CreateFunctionModalFlowSeed;
}

const mapCreateFunctionModalArrowFields = (
  input: FunctionArrowField[],
  output: FunctionArrowField[],
): CreateFunctionModalState["arrowFields"] => ({
  [FunctionContractSide.INPUT]: input.map((field, index) => ({ ...field, id: `in_${index}` })),
  [FunctionContractSide.OUTPUT]: output.map((field, index) => ({ ...field, id: `out_${index}` })),
});

const mapCreateFunctionModalSchemaTexts = (
  input: JsonValue,
  output: JsonValue,
): CreateFunctionModalState["schemaTexts"] => ({
  [FunctionContractSide.INPUT]: formatJson(input),
  [FunctionContractSide.OUTPUT]: formatJson(output),
});

const mapCreateFunctionModalFlowContract = (
  contract: AlchemyFlowContract | undefined,
): Partial<CreateFunctionModalState> | undefined =>
  match(contract)
    .with(undefined, () => undefined)
    .with({ kind: "jsonSchema" }, ({ kind, input, output }) => {
      const inputSchema = parseJson(input).value;
      const outputSchema = parseJson(output).value;
      return isJsonObject(inputSchema) && isJsonObject(outputSchema)
        ? {
            contractKind: kind,
            schemaTexts: mapCreateFunctionModalSchemaTexts(inputSchema, outputSchema),
          }
        : undefined;
    })
    .with({ kind: "arrow" }, ({ kind, input, output }) =>
      input.length > 0 &&
      output.length > 0 &&
      [...input, ...output].every(({ name, type }) => name.trim() && parseArrowType(type))
        ? { contractKind: kind, arrowFields: mapCreateFunctionModalArrowFields(input, output) }
        : undefined,
    )
    .exhaustive();

export const getCreateFunctionModalTemplate = (state: CreateFunctionModalState) =>
  state.templates.find((template) => template.id === state.template);

export const createCreateFunctionModalTemplateFiles = (
  template: Template,
  contractKind: FunctionContractKind,
) =>
  decodeFunctionSourceFiles(
    match(contractKind)
      .with("jsonSchema", () => template.jsonSchema?.files ?? [])
      .with("arrow", () => template.arrow?.files ?? [])
      .exhaustive(),
  );

const mapCreateFunctionModalTemplateContracts = (template: Template) => {
  const json = template.jsonSchema?.contract?.kind;
  const arrow = template.arrow?.contract?.kind;
  return {
    ...(json?.case === "jsonSchema" && {
      schemaTexts: mapCreateFunctionModalSchemaTexts(
        json.value.input ?? {},
        json.value.output ?? {},
      ),
    }),
    ...(arrow?.case === "arrow" && {
      arrowFields: mapCreateFunctionModalArrowFields(
        decodeFunctionArrowFields(arrow.value.inputSchema),
        decodeFunctionArrowFields(arrow.value.outputSchema),
      ),
    }),
  };
};

const removeCreateFunctionModalTemplateEnv = (
  state: CreateFunctionModalState,
): Pick<CreateFunctionModalState, "variables" | "secrets"> => ({
  variables: state.variables.filter(({ key }) => !state.templateEnvKeys.includes(key)),
  secrets: state.secrets.filter(({ key }) => !state.templateEnvKeys.includes(key)),
});

const createCreateFunctionModalTemplateSnapshot = (
  state: CreateFunctionModalState,
): CreateFunctionModalTemplateSnapshot => ({
  contractKind: state.contractKind,
  schemaTexts: state.schemaTexts,
  arrowFields: state.arrowFields,
  runtime: state.runtime,
  sourceFiles: state.sourceFiles,
  sourceFile: state.sourceFile,
  isSourceTouched: state.isSourceTouched,
  sourceContractKind: state.sourceContractKind,
  network: state.network,
  timeoutMs: state.timeoutMs,
  retries: state.retries,
});

export const clearCreateFunctionModalTemplate = (
  state: CreateFunctionModalState,
): CreateFunctionModalState =>
  state.beforeTemplate
    ? {
        ...state,
        ...removeCreateFunctionModalTemplateEnv(state),
        ...state.beforeTemplate,
        beforeTemplate: undefined,
        templateEnvKeys: [],
        template: "",
        name: state.isNameTouched ? state.name : "",
      }
    : state;

export const applyCreateFunctionModalTemplate = (
  state: CreateFunctionModalState,
  template: Template,
): CreateFunctionModalState => {
  const { variables, secrets } = removeCreateFunctionModalTemplateEnv(state);
  const taken = [...variables, ...state.stored, ...secrets].map(({ key }) => key);
  const addedVariables = Object.entries(template.env)
    .filter(([key]) => !taken.includes(key))
    .map(([key, value]) => ({ key, value }));
  const addedSecrets = template.secrets
    .filter((key) => !taken.includes(key))
    .map((key) => ({ key, value: "" }));
  const sourceFiles = createCreateFunctionModalTemplateFiles(template, state.contractKind);
  return {
    ...state,
    beforeTemplate: state.beforeTemplate ?? createCreateFunctionModalTemplateSnapshot(state),
    templateEnvKeys: [...addedVariables, ...addedSecrets].map(({ key }) => key),
    template: template.id,
    name: state.isNameTouched ? state.name : template.id,
    runtime: template.runtime,
    sourceFiles,
    sourceFile: sourceFiles[0]?.path ?? "",
    isSourceTouched: false,
    sourceContractKind: state.contractKind,
    ...(state.contractCaller === undefined && mapCreateFunctionModalTemplateContracts(template)),
    variables: [...variables, ...addedVariables],
    secrets: [...secrets, ...addedSecrets],
    network: template.network,
    timeoutMs: template.timeoutMs > 0n ? Number(template.timeoutMs) : state.timeoutMs,
    retries: template.retries,
  };
};

export const createInitialCreateFunctionModalState = ({
  alchemyFunction,
  version,
  runtimes,
  limits,
  templates,
  flowSeed = {},
}: CreateFunctionModalSeed): CreateFunctionModalState => {
  const spec = version?.spec;
  const contract = spec?.contract?.kind;
  const seed = alchemyFunction ? {} : flowSeed;
  const seededContract = mapCreateFunctionModalFlowContract(seed.contract);
  const runtime =
    getFunctionRuntime(runtimes, spec?.image) ??
    runtimes.find(({ id }) => id === seed.runtime) ??
    runtimes[0];
  const contractKind = contract?.case ?? seededContract?.contractKind ?? "jsonSchema";
  const starterFiles = runtime ? createFunctionSourceStarter(runtime, contractKind) : [];
  const sourceFiles = spec?.source ? decodeFunctionSourceFiles(spec.source.files) : starterFiles;
  const state: CreateFunctionModalState = {
    ...CREATE_FUNCTION_MODAL_DEFAULT_STATE,
    runtimes,
    limits,
    templates,
    runtime: runtime?.id ?? "",
    sourceFiles,
    sourceFile: sourceFiles[0]?.path ?? "",
    name: seed.functionName ?? "",
    isNameTouched: !!seed.functionName,
    description: seed.functionDescription ?? "",
    ...seededContract,
    contractCaller: seededContract
      ? seed.returnLabel || CREATE_FUNCTION_MODAL_CONTRACT_DEFAULT_CALLER
      : undefined,
    sourceContractKind: contractKind,
  };
  if (!alchemyFunction) return state;
  return {
    ...state,
    mode: CreateFunctionModalMode.VERSION,
    functionId: alchemyFunction.id,
    functionNetwork: alchemyFunction.network,
    step: CreateFunctionModalStep.SOURCE,
    name: alchemyFunction.name,
    isNameTouched: true,
    description: alchemyFunction.description,
    sourceKind: spec?.source ? FunctionSourceKind.SOURCE : FunctionSourceKind.IMAGE,
    image: spec?.source ? "" : (spec?.image ?? ""),
    isSourceTouched: !!spec?.source,
    command: spec?.command ?? [],
    ...createFunctionEnv(spec),
    contractKind,
    schemaTexts:
      contract?.case === "jsonSchema"
        ? mapCreateFunctionModalSchemaTexts(contract.value.input ?? {}, contract.value.output ?? {})
        : state.schemaTexts,
    arrowFields:
      contract?.case === "arrow"
        ? mapCreateFunctionModalArrowFields(
            decodeFunctionArrowFields(contract.value.inputSchema),
            decodeFunctionArrowFields(contract.value.outputSchema),
          )
        : state.arrowFields,
    vcpus: state.vcpus,
    memoryMib: state.memoryMib,
    timeoutMs: state.timeoutMs,
  };
};

export const getCreateFunctionModalRuntime = (state: CreateFunctionModalState) =>
  state.runtimes.find((runtime) => runtime.id === state.runtime);

export const getCreateFunctionModalSteps = (
  mode: CreateFunctionModalMode,
  sourceKind: FunctionSourceKind,
) =>
  CREATE_FUNCTION_MODAL_STEPS.filter(
    (step) =>
      !CREATE_FUNCTION_MODAL_MODE_TO_SKIPPED_STEPS_MAP[mode].includes(step) &&
      !CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_SKIPPED_STEPS_MAP[sourceKind].includes(step),
  );

const getSourceHints = (state: CreateFunctionModalState) => [
  ...match(state.sourceKind)
    .with(FunctionSourceKind.IMAGE, () =>
      CREATE_FUNCTION_MODAL_IMAGE_PATTERN.test(state.image.trim())
        ? []
        : ["Enter an OCI image reference, such as ghcr.io/acme/enrich:1.4.0"],
    )
    .with(FunctionSourceKind.TEMPLATE, () =>
      [
        getCreateFunctionModalTemplate(state) ? undefined : "Pick a template",
        state.mode === CreateFunctionModalMode.VERSION &&
        getCreateFunctionModalTemplate(state)?.network === Network.EGRESS &&
        state.functionNetwork !== Network.EGRESS
          ? "This template needs network egress. Turn it on in the function's settings first"
          : undefined,
        state.secrets.some((pair) => !pair.value.trim()) ? "Every secret needs a value" : undefined,
      ].filter((hint): hint is string => hint !== undefined),
    )
    .with(FunctionSourceKind.SOURCE, () => [])
    .exhaustive(),
  ...getFunctionEnvHints(state),
];

const getCodeHints = (state: CreateFunctionModalState) => {
  const bytes = state.sourceFiles.reduce(
    (total, file) => total + encodeFunctionSourceFile(file.content).byteLength,
    0,
  );
  return [
    state.sourceFiles.some((file) => !file.content.trim()) ? "Every file needs content" : undefined,
    state.sourceContractKind === state.contractKind
      ? undefined
      : `The code reads a ${FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[state.sourceContractKind]} contract. Edit it for ${FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[state.contractKind]}`,
    state.limits && state.sourceFiles.length > state.limits.maxFiles
      ? `At most ${state.limits.maxFiles} files`
      : undefined,
    state.limits && bytes > Number(state.limits.maxBytes)
      ? `At most ${formatBytes(Number(state.limits.maxBytes), { binary: true })} of source`
      : undefined,
  ].filter((hint): hint is string => hint !== undefined);
};

const getContractHints = (
  state: CreateFunctionModalState,
  schemaErrors: CreateFunctionModalDerivedState["schemaErrors"],
) =>
  CREATE_FUNCTION_MODAL_CONTRACT_SIDES.flatMap((side) => {
    const label = CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP[side];
    return match(state.contractKind)
      .with("jsonSchema", () => (schemaErrors[side] ? [`${label}: ${schemaErrors[side]}`] : []))
      .with("arrow", () =>
        !state.arrowFields[side].length ||
        state.arrowFields[side].some((field) => !field.name.trim())
          ? [`Every ${label.toLowerCase()} field needs a name`]
          : [],
      )
      .exhaustive();
  });

const getResourcesHints = (state: CreateFunctionModalState) =>
  [
    state.vcpus < CREATE_FUNCTION_MODAL_VCPUS_MIN || state.vcpus > CREATE_FUNCTION_MODAL_VCPUS_MAX
      ? `vCPUs must be between ${CREATE_FUNCTION_MODAL_VCPUS_MIN} and ${CREATE_FUNCTION_MODAL_VCPUS_MAX}`
      : undefined,
    state.memoryMib < CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN ||
    state.memoryMib > CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX
      ? `Memory must be between ${CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN} and ${CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX} MiB`
      : undefined,
    state.timeoutMs < CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS ||
    state.timeoutMs > CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS
      ? `Timeout must be between ${formatMillis(CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS)} and ${formatMillis(CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS)}`
      : undefined,
  ].filter((hint): hint is string => hint !== undefined);

export const getCreateFunctionModalStepHints = (
  state: CreateFunctionModalState,
  { nameError, schemaErrors }: Pick<CreateFunctionModalDerivedState, "nameError" | "schemaErrors">,
) =>
  match(state.step)
    .with(CreateFunctionModalStep.DETAILS, () => (nameError ? [nameError] : []))
    .with(CreateFunctionModalStep.SOURCE, () => getSourceHints(state))
    .with(CreateFunctionModalStep.CODE, () => getCodeHints(state))
    .with(CreateFunctionModalStep.CONTRACT, () => getContractHints(state, schemaErrors))
    .with(CreateFunctionModalStep.RESOURCES, () => getResourcesHints(state))
    .exhaustive();

export const getCreateFunctionModalStepSummary = (
  state: CreateFunctionModalState,
  step: CreateFunctionModalStep,
) =>
  match(step)
    .with(CreateFunctionModalStep.DETAILS, () => state.name)
    .with(CreateFunctionModalStep.SOURCE, () =>
      [
        FUNCTION_SOURCE_KIND_TO_LABEL_MAP[state.sourceKind],
        match(state.sourceKind)
          .with(FunctionSourceKind.IMAGE, () => state.image.split("/").pop() ?? state.image)
          .with(FunctionSourceKind.SOURCE, () => getCreateFunctionModalRuntime(state)?.label ?? "")
          .with(
            FunctionSourceKind.TEMPLATE,
            () => getCreateFunctionModalTemplate(state)?.label ?? "",
          )
          .exhaustive(),
      ].join(", "),
    )
    .with(CreateFunctionModalStep.CODE, () => state.sourceFiles.map((file) => file.path).join(", "))
    .with(
      CreateFunctionModalStep.CONTRACT,
      () => FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[state.contractKind],
    )
    .with(
      CreateFunctionModalStep.RESOURCES,
      () =>
        `${state.vcpus} vCPU, ${formatMemory(state.memoryMib)}, ${formatMillis(state.timeoutMs)}`,
    )
    .exhaustive();
