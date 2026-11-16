import type { Runtime } from "@/gen/functions/v1/functions_pb";

import type {
  CreateFunctionModalArrowField,
  CreateFunctionModalState,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import type {
  FunctionContractKind,
  FunctionContractSide,
  FunctionSourceFile,
  FunctionSourceKind,
} from "@/pages/functions/types";

export enum CreateFunctionModalActionType {
  SET_NAME = "SET_NAME",
  SET_DESCRIPTION = "SET_DESCRIPTION",
  SET_SOURCE_KIND = "SET_SOURCE_KIND",
  SET_IMAGE = "SET_IMAGE",
  SET_RUNTIME = "SET_RUNTIME",
  SET_SOURCE_FILE = "SET_SOURCE_FILE",
  SET_SOURCE_FILE_CONTENT = "SET_SOURCE_FILE_CONTENT",
  SET_COMMAND = "SET_COMMAND",
  SET_VARIABLES = "SET_VARIABLES",
  SET_SECRETS = "SET_SECRETS",
  SET_CONTRACT_KIND = "SET_CONTRACT_KIND",
  SET_SCHEMA_TEXT = "SET_SCHEMA_TEXT",
  ADD_ARROW_FIELD = "ADD_ARROW_FIELD",
  UPDATE_ARROW_FIELD = "UPDATE_ARROW_FIELD",
  REMOVE_ARROW_FIELD = "REMOVE_ARROW_FIELD",
  SET_VCPUS = "SET_VCPUS",
  SET_MEMORY_MIB = "SET_MEMORY_MIB",
  SET_TIMEOUT_MS = "SET_TIMEOUT_MS",
  SET_MAX_CONCURRENCY = "SET_MAX_CONCURRENCY",
  SET_RETRIES = "SET_RETRIES",
  SET_NETWORK = "SET_NETWORK",
  GO_TO_STEP = "GO_TO_STEP",
  GO_BACK = "GO_BACK",
  GO_NEXT = "GO_NEXT",
  SET_SUBMITTING = "SET_SUBMITTING",
}

export interface SetNameAction {
  type: CreateFunctionModalActionType.SET_NAME;
  payload: CreateFunctionModalState["name"];
}

export interface SetDescriptionAction {
  type: CreateFunctionModalActionType.SET_DESCRIPTION;
  payload: CreateFunctionModalState["description"];
}

export interface SetSourceKindAction {
  type: CreateFunctionModalActionType.SET_SOURCE_KIND;
  payload: FunctionSourceKind;
}

export interface SetImageAction {
  type: CreateFunctionModalActionType.SET_IMAGE;
  payload: CreateFunctionModalState["image"];
}

export interface SetRuntimeAction {
  type: CreateFunctionModalActionType.SET_RUNTIME;
  payload: Runtime["id"];
}

export interface SetSourceFileAction {
  type: CreateFunctionModalActionType.SET_SOURCE_FILE;
  payload: FunctionSourceFile["path"];
}

export interface SetSourceFileContentAction {
  type: CreateFunctionModalActionType.SET_SOURCE_FILE_CONTENT;
  payload: FunctionSourceFile;
}

export interface SetCommandAction {
  type: CreateFunctionModalActionType.SET_COMMAND;
  payload: CreateFunctionModalState["command"];
}

export interface SetVariablesAction {
  type: CreateFunctionModalActionType.SET_VARIABLES;
  payload: CreateFunctionModalState["variables"];
}

export interface SetSecretsAction {
  type: CreateFunctionModalActionType.SET_SECRETS;
  payload: CreateFunctionModalState["secrets"];
}

export interface SetContractKindAction {
  type: CreateFunctionModalActionType.SET_CONTRACT_KIND;
  payload: FunctionContractKind;
}

export interface SetSchemaTextAction {
  type: CreateFunctionModalActionType.SET_SCHEMA_TEXT;
  payload: { side: FunctionContractSide; text: string };
}

export interface AddArrowFieldAction {
  type: CreateFunctionModalActionType.ADD_ARROW_FIELD;
  payload: { side: FunctionContractSide; field: CreateFunctionModalArrowField };
}

export interface UpdateArrowFieldAction {
  type: CreateFunctionModalActionType.UPDATE_ARROW_FIELD;
  payload: {
    side: FunctionContractSide;
    id: CreateFunctionModalArrowField["id"];
    partial: Partial<CreateFunctionModalArrowField>;
  };
}

export interface RemoveArrowFieldAction {
  type: CreateFunctionModalActionType.REMOVE_ARROW_FIELD;
  payload: { side: FunctionContractSide; id: CreateFunctionModalArrowField["id"] };
}

export interface SetVcpusAction {
  type: CreateFunctionModalActionType.SET_VCPUS;
  payload: CreateFunctionModalState["vcpus"];
}

export interface SetMemoryMibAction {
  type: CreateFunctionModalActionType.SET_MEMORY_MIB;
  payload: CreateFunctionModalState["memoryMib"];
}

export interface SetTimeoutMsAction {
  type: CreateFunctionModalActionType.SET_TIMEOUT_MS;
  payload: CreateFunctionModalState["timeoutMs"];
}

export interface SetMaxConcurrencyAction {
  type: CreateFunctionModalActionType.SET_MAX_CONCURRENCY;
  payload: CreateFunctionModalState["maxConcurrency"];
}

export interface SetRetriesAction {
  type: CreateFunctionModalActionType.SET_RETRIES;
  payload: CreateFunctionModalState["retries"];
}

export interface SetNetworkAction {
  type: CreateFunctionModalActionType.SET_NETWORK;
  payload: CreateFunctionModalState["network"];
}

export interface GoToStepAction {
  type: CreateFunctionModalActionType.GO_TO_STEP;
  payload: CreateFunctionModalStep;
}

export interface GoBackAction {
  type: CreateFunctionModalActionType.GO_BACK;
}

export interface GoNextAction {
  type: CreateFunctionModalActionType.GO_NEXT;
}

export interface SetSubmittingAction {
  type: CreateFunctionModalActionType.SET_SUBMITTING;
  payload: boolean;
}

export type CreateFunctionModalAction =
  | SetNameAction
  | SetDescriptionAction
  | SetSourceKindAction
  | SetImageAction
  | SetRuntimeAction
  | SetSourceFileAction
  | SetSourceFileContentAction
  | SetCommandAction
  | SetVariablesAction
  | SetSecretsAction
  | SetContractKindAction
  | SetSchemaTextAction
  | AddArrowFieldAction
  | UpdateArrowFieldAction
  | RemoveArrowFieldAction
  | SetVcpusAction
  | SetMemoryMibAction
  | SetTimeoutMsAction
  | SetMaxConcurrencyAction
  | SetRetriesAction
  | SetNetworkAction
  | GoToStepAction
  | GoBackAction
  | GoNextAction
  | SetSubmittingAction;
