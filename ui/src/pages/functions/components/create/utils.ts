import type { JsonValue } from "@bufbuild/protobuf";
import pluralize from "pluralize";
import { match } from "ts-pattern";

import { InvocationProtocol } from "@/gen/functions/v1/common_pb";
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
  CreateFunctionModalContractSide,
  type CreateFunctionModalDerivedState,
  CreateFunctionModalMode,
  type CreateFunctionModalState,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import {
  FUNCTION_CONTRACT_KIND_TO_LABEL_MAP,
  INVOCATION_PROTOCOL_TO_LABEL_MAP,
} from "@/pages/functions/constants";
import { decodeFunctionArrowFields, getFunctionCurrentVersion } from "@/pages/functions/utils";

import { EMPTY_VALUE } from "@/utils/format";
import { formatJson } from "@/utils/json";

export const createInitialState = (fn?: AlchemyFunction): CreateFunctionModalState => {
  const state = CREATE_FUNCTION_MODAL_DEFAULT_STATE;
  if (!fn) return state;
  const spec = (getFunctionCurrentVersion(fn) ?? fn.versions[0])?.spec;
  const contract = spec?.contract?.kind;
  return {
    ...state,
    mode: CreateFunctionModalMode.VERSION,
    functionId: fn.id,
    step: CreateFunctionModalStep.RUNTIME,
    name: fn.name,
    isNameTouched: true,
    description: fn.description,
    image: spec?.image ?? "",
    command: spec?.command ?? [],
    env: Object.entries(spec?.env ?? {}).map(([key, value]) => ({ key, value })),
    protocol: spec?.protocol ?? InvocationProtocol.EXEC,
    contractKind: contract?.case ?? "jsonSchema",
    schemaTexts:
      contract?.case === "jsonSchema"
        ? {
            [CreateFunctionModalContractSide.INPUT]: formatJson(contract.value.input ?? {}),
            [CreateFunctionModalContractSide.OUTPUT]: formatJson(contract.value.output ?? {}),
          }
        : state.schemaTexts,
    arrowFields:
      contract?.case === "arrow"
        ? {
            [CreateFunctionModalContractSide.INPUT]: decodeFunctionArrowFields(
              contract.value.inputSchema,
            ).map((field, index) => ({
              ...field,
              id: `in_${index}`,
            })),
            [CreateFunctionModalContractSide.OUTPUT]: decodeFunctionArrowFields(
              contract.value.outputSchema,
            ).map((field, index) => ({
              ...field,
              id: `out_${index}`,
            })),
          }
        : state.arrowFields,
    vcpus: spec?.resources?.vcpus ?? state.vcpus,
    memoryMib: spec?.resources?.memoryMib ?? state.memoryMib,
    timeoutMs: spec ? Number(spec.timeoutMs) : state.timeoutMs,
  };
};

const getContractHints = (
  state: CreateFunctionModalState,
  schemaErrors: CreateFunctionModalDerivedState["schemaErrors"],
): string[] =>
  CREATE_FUNCTION_MODAL_CONTRACT_SIDES.flatMap((side) => {
    const label = CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP[side];
    return match(state.contractKind)
      .with("jsonSchema", () => (schemaErrors[side] ? [`${label}: ${schemaErrors[side]}`] : []))
      .with("arrow", () =>
        state.arrowFields[side].length === 0 ||
        state.arrowFields[side].some((field) => field.name.trim() === "")
          ? [`Every ${label.toLowerCase()} field needs a name`]
          : [],
      )
      .exhaustive();
  });

const getResourcesHints = (state: CreateFunctionModalState): string[] =>
  [
    state.vcpus < CREATE_FUNCTION_MODAL_VCPUS_MIN || state.vcpus > CREATE_FUNCTION_MODAL_VCPUS_MAX
      ? `vCPUs must be between ${CREATE_FUNCTION_MODAL_VCPUS_MIN} and ${CREATE_FUNCTION_MODAL_VCPUS_MAX}`
      : null,
    state.memoryMib < CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN ||
    state.memoryMib > CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX
      ? `Memory must be between ${CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN} and ${CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX} MiB`
      : null,
    state.timeoutMs < CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS ||
    state.timeoutMs > CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS
      ? "Timeout must be between 1s and 15m"
      : null,
  ].filter((hint): hint is string => hint !== null);

export const getCreateFunctionModalStepHints = (
  state: CreateFunctionModalState,
  { nameError, schemaErrors }: Pick<CreateFunctionModalDerivedState, "nameError" | "schemaErrors">,
): string[] =>
  match(state.step)
    .with(CreateFunctionModalStep.DETAILS, () => (nameError ? [nameError] : []))
    .with(CreateFunctionModalStep.RUNTIME, () =>
      !CREATE_FUNCTION_MODAL_IMAGE_PATTERN.test(state.image.trim())
        ? ["Enter an OCI image reference, e.g. ghcr.io/galaxy-io/enrich:1.4.0"]
        : [],
    )
    .with(CreateFunctionModalStep.CONTRACT, () => getContractHints(state, schemaErrors))
    .with(CreateFunctionModalStep.RESOURCES, () => getResourcesHints(state))
    .with(CreateFunctionModalStep.REVIEW, () => [])
    .exhaustive();

export const getCreateFunctionModalStepSummary = (
  state: CreateFunctionModalState,
  step: CreateFunctionModalStep,
): string =>
  match(step)
    .with(CreateFunctionModalStep.DETAILS, () => state.name)
    .with(
      CreateFunctionModalStep.RUNTIME,
      () => `image · ${INVOCATION_PROTOCOL_TO_LABEL_MAP[state.protocol]}`,
    )
    .with(
      CreateFunctionModalStep.CONTRACT,
      () => FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[state.contractKind],
    )
    .with(
      CreateFunctionModalStep.RESOURCES,
      () => `${state.vcpus} vCPU · ${state.memoryMib} MiB · ${state.timeoutMs / 1000}s`,
    )
    .with(CreateFunctionModalStep.REVIEW, () => "")
    .exhaustive();

export const describeCreateFunctionModalContractSide = (
  state: CreateFunctionModalState,
  side: CreateFunctionModalContractSide,
): string =>
  match(state.contractKind)
    .with("arrow", () => pluralize("field", state.arrowFields[side].length, true))
    .with("jsonSchema", () => {
      try {
        const schema = JSON.parse(state.schemaTexts[side]) as JsonValue;
        if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
          return EMPTY_VALUE;
        }
        const { properties, type } = schema;
        if (properties && typeof properties === "object") {
          return pluralize("property", Object.keys(properties).length, true);
        }
        return typeof type === "string" ? type : EMPTY_VALUE;
      } catch {
        return EMPTY_VALUE;
      }
    })
    .exhaustive();
