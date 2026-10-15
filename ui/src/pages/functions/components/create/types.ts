import type { Resources } from "@/gen/functions/v1/common_pb";
import type { Function as AlchemyFunction, FunctionSpec } from "@/gen/functions/v1/functions_pb";

import type {
  FunctionArrowField,
  FunctionContractKind,
  FunctionContractSide,
} from "@/pages/functions/types";

export enum CreateFunctionModalStep {
  DETAILS = "DETAILS",
  RUNTIME = "RUNTIME",
  CONTRACT = "CONTRACT",
  RESOURCES = "RESOURCES",
}

export enum CreateFunctionModalMode {
  FUNCTION = "FUNCTION",
  VERSION = "VERSION",
}

export interface CreateFunctionModalArrowField extends FunctionArrowField {
  id: string;
}

interface CreateFunctionModalEnvEntry {
  key: string;
  value: string;
}

export interface CreateFunctionModalState {
  mode: CreateFunctionModalMode;
  functionId: AlchemyFunction["id"] | undefined;
  step: CreateFunctionModalStep;
  name: AlchemyFunction["name"];
  isNameTouched: boolean;
  description: AlchemyFunction["description"];
  image: FunctionSpec["image"];
  command: FunctionSpec["command"];
  env: CreateFunctionModalEnvEntry[];
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
