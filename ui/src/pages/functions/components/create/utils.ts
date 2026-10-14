import { match } from "ts-pattern";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import {
  CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP,
  CREATE_FUNCTION_MODAL_CONTRACT_SIDES,
  CREATE_FUNCTION_MODAL_DEFAULT_STATE,
  CREATE_FUNCTION_MODAL_IMAGE_PATTERN,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX,
  CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN,
  CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS,
  CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS,
  CREATE_FUNCTION_MODAL_VCPUS_MAX,
  CREATE_FUNCTION_MODAL_VCPUS_MIN,
} from "@/pages/functions/components/create/constants";
import {
  type CreateFunctionModalDerivedState,
  CreateFunctionModalMode,
  type CreateFunctionModalState,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import { FunctionContractSide } from "@/pages/functions/types";
import { decodeFunctionArrowFields, getFunctionCurrentVersion } from "@/pages/functions/utils";

import { formatMemory, formatMillis } from "@/utils/format";
import { formatJson } from "@/utils/json";

export const createInitialCreateFunctionModalState = (
  alchemyFunction: AlchemyFunction | undefined,
): CreateFunctionModalState => {
  const state = CREATE_FUNCTION_MODAL_DEFAULT_STATE;
  if (!alchemyFunction) return state;
  const spec = (getFunctionCurrentVersion(alchemyFunction) ?? alchemyFunction.versions[0])?.spec;
  const contract = spec?.contract?.kind;
  return {
    ...state,
    mode: CreateFunctionModalMode.VERSION,
    functionId: alchemyFunction.id,
    step: CreateFunctionModalStep.RUNTIME,
    name: alchemyFunction.name,
    isNameTouched: true,
    description: alchemyFunction.description,
    image: spec?.image ?? "",
    command: spec?.command ?? [],
    env: Object.entries(spec?.env ?? {}).map(([key, value]) => ({ key, value })),
    contractKind: contract?.case ?? "jsonSchema",
    schemaTexts:
      contract?.case === "jsonSchema"
        ? {
            [FunctionContractSide.INPUT]: formatJson(contract.value.input ?? {}),
            [FunctionContractSide.OUTPUT]: formatJson(contract.value.output ?? {}),
          }
        : state.schemaTexts,
    arrowFields:
      contract?.case === "arrow"
        ? {
            [FunctionContractSide.INPUT]: decodeFunctionArrowFields(contract.value.inputSchema).map(
              (field, index) => ({ ...field, id: `in_${index}` }),
            ),
            [FunctionContractSide.OUTPUT]: decodeFunctionArrowFields(
              contract.value.outputSchema,
            ).map((field, index) => ({ ...field, id: `out_${index}` })),
          }
        : state.arrowFields,
    vcpus: spec?.resources?.vcpus || state.vcpus,
    memoryMib: spec?.resources?.memoryMib || state.memoryMib,
    timeoutMs: spec?.timeoutMs ? Number(spec.timeoutMs) : state.timeoutMs,
  };
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
    .with(CreateFunctionModalStep.RUNTIME, () =>
      CREATE_FUNCTION_MODAL_IMAGE_PATTERN.test(state.image.trim())
        ? []
        : ["Enter an OCI image reference, such as ghcr.io/acme/enrich:1.4.0"],
    )
    .with(CreateFunctionModalStep.CONTRACT, () => getContractHints(state, schemaErrors))
    .with(CreateFunctionModalStep.RESOURCES, () => getResourcesHints(state))
    .exhaustive();

export const getCreateFunctionModalStepSummary = (
  state: CreateFunctionModalState,
  step: CreateFunctionModalStep,
) =>
  match(step)
    .with(CreateFunctionModalStep.DETAILS, () => state.name)
    .with(CreateFunctionModalStep.RUNTIME, () => state.image.split("/").pop() ?? state.image)
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
