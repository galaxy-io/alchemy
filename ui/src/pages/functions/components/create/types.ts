import type { InvocationProtocol, Resources } from "@/gen/functions/v1/common_pb";
import type { Function as AlchemyFunction, FunctionSpec } from "@/gen/functions/v1/functions_pb";

import type { FunctionArrowField, FunctionContractKind } from "@/pages/functions/types";

export enum CreateFunctionModalStep {
  DETAILS = "DETAILS",
  RUNTIME = "RUNTIME",
  CONTRACT = "CONTRACT",
  RESOURCES = "RESOURCES",
  REVIEW = "REVIEW",
}

export enum CreateFunctionModalMode {
  FUNCTION = "FUNCTION",
  VERSION = "VERSION",
}

export enum CreateFunctionModalContractSide {
  INPUT = "INPUT",
  OUTPUT = "OUTPUT",
}

export interface CreateFunctionModalArrowField extends FunctionArrowField {
  id: string;
}

export interface CreateFunctionModalEnvEntry {
  key: string;
  value: string;
}

export interface CreateFunctionModalState {
  mode: CreateFunctionModalMode;
  functionId: AlchemyFunction["id"] | null;
  step: CreateFunctionModalStep;
  name: AlchemyFunction["name"];
  isNameTouched: boolean;
  description: AlchemyFunction["description"];
  image: FunctionSpec["image"];
  command: FunctionSpec["command"];
  env: CreateFunctionModalEnvEntry[];
  protocol: InvocationProtocol;
  contractKind: FunctionContractKind;
  schemaTexts: Record<CreateFunctionModalContractSide, string>;
  arrowFields: Record<CreateFunctionModalContractSide, CreateFunctionModalArrowField[]>;
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
  schemaErrors: Record<CreateFunctionModalContractSide, string | undefined>;
  spec: FunctionSpec | null;
}

export type CreateFunctionModalContextValue = CreateFunctionModalState &
  CreateFunctionModalDerivedState;
