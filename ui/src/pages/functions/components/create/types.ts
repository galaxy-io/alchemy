import type { KeyValueInputPair } from "@galaxy-io/dls/inputs/KeyValueInput";

import type { Network, Resources } from "@/gen/functions/v1/common_pb";
import type {
  Function as AlchemyFunction,
  FunctionSpec,
  Runtime,
  SourceLimits,
} from "@/gen/functions/v1/functions_pb";
import type { Template } from "@/gen/functions/v1/templates_pb";

import type {
  FunctionArrowField,
  FunctionContractKind,
  FunctionContractSide,
  FunctionSourceFile,
  FunctionSourceKind,
} from "@/pages/functions/types";

import type { AlchemyFlowSeed } from "@/module/schemas";

export enum CreateFunctionModalStep {
  SOURCE = "SOURCE",
  CONTRACT = "CONTRACT",
  CODE = "CODE",
  RESOURCES = "RESOURCES",
  DETAILS = "DETAILS",
}

export enum CreateFunctionModalMode {
  FUNCTION = "FUNCTION",
  VERSION = "VERSION",
}

export interface CreateFunctionModalArrowField extends FunctionArrowField {
  id: string;
}

export interface CreateFunctionModalState {
  mode: CreateFunctionModalMode;
  functionId: AlchemyFunction["id"] | undefined;
  step: CreateFunctionModalStep;
  name: AlchemyFunction["name"];
  isNameTouched: boolean;
  description: AlchemyFunction["description"];
  sourceKind: FunctionSourceKind;
  image: FunctionSpec["image"];
  runtimes: Runtime[];
  limits: SourceLimits | undefined;
  templates: Template[];
  template: Template["id"];
  runtime: Runtime["id"];
  sourceFiles: FunctionSourceFile[];
  sourceFile: FunctionSourceFile["path"];
  isSourceTouched: boolean;
  command: FunctionSpec["command"];
  variables: KeyValueInputPair[];
  stored: KeyValueInputPair[];
  secrets: KeyValueInputPair[];
  secretNames: NonNullable<FunctionSpec["secrets"]>;
  contractKind: FunctionContractKind;
  contractCaller: AlchemyFlowSeed["returnLabel"];
  schemaTexts: Record<FunctionContractSide, string>;
  arrowFields: Record<FunctionContractSide, CreateFunctionModalArrowField[]>;
  vcpus: Resources["vcpus"];
  memoryMib: Resources["memoryMib"];
  timeoutMs: number;
  maxConcurrency: number | null;
  retries: number;
  network: Network;
  isSubmitting: boolean;
}

export interface CreateFunctionModalDerivedState {
  steps: CreateFunctionModalStep[];
  stepIndex: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  isNextDisabled: boolean;
  hints: string[];
  nameError: string | undefined;
  schemaErrors: Record<FunctionContractSide, string | undefined>;
  spec: FunctionSpec | undefined;
}

export type CreateFunctionModalContextValue = CreateFunctionModalState &
  CreateFunctionModalDerivedState;

export type CreateFunctionModalFlowSeed = Pick<
  AlchemyFlowSeed,
  "functionName" | "functionDescription" | "runtime" | "contract" | "returnLabel"
>;
