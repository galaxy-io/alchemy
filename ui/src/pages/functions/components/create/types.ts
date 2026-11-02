import type { Resources } from "@/gen/functions/v1/common_pb";
import type {
  Function as AlchemyFunction,
  FunctionSpec,
  Runtime,
  SourceLimits,
} from "@/gen/functions/v1/functions_pb";

import type {
  FunctionArrowField,
  FunctionContractKind,
  FunctionContractSide,
  FunctionSourceFile,
  FunctionSourceKind,
} from "@/pages/functions/types";

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

export interface CreateFunctionModalEnvEntry {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
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
  runtime: Runtime["id"];
  sourceFiles: FunctionSourceFile[];
  sourceFile: FunctionSourceFile["path"];
  isSourceTouched: boolean;
  command: FunctionSpec["command"];
  env: CreateFunctionModalEnvEntry[];
  secretNames: NonNullable<FunctionSpec["secrets"]>;
  contractKind: FunctionContractKind;
  schemaTexts: Record<FunctionContractSide, string>;
  arrowFields: Record<FunctionContractSide, CreateFunctionModalArrowField[]>;
  vcpus: Resources["vcpus"];
  memoryMib: Resources["memoryMib"];
  timeoutMs: number;
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
