import type { InvocationProtocol } from "@/gen/functions/v1/common_pb";

import type {
  CreateFunctionModalArrowField,
  CreateFunctionModalContractSide,
  CreateFunctionModalState,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import type { FunctionContractKind } from "@/pages/functions/types";

export enum CreateFunctionModalActionType {
  SET_NAME = "SET_NAME",
  SET_DESCRIPTION = "SET_DESCRIPTION",
  SET_IMAGE = "SET_IMAGE",
  SET_PROTOCOL = "SET_PROTOCOL",
  SET_COMMAND = "SET_COMMAND",
  SET_ENV = "SET_ENV",
  SET_CONTRACT_KIND = "SET_CONTRACT_KIND",
  SET_SCHEMA_TEXT = "SET_SCHEMA_TEXT",
  ADD_ARROW_FIELD = "ADD_ARROW_FIELD",
  UPDATE_ARROW_FIELD = "UPDATE_ARROW_FIELD",
  REMOVE_ARROW_FIELD = "REMOVE_ARROW_FIELD",
  SET_VCPUS = "SET_VCPUS",
  SET_MEMORY_MIB = "SET_MEMORY_MIB",
  SET_TIMEOUT_MS = "SET_TIMEOUT_MS",
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

export interface SetImageAction {
  type: CreateFunctionModalActionType.SET_IMAGE;
  payload: CreateFunctionModalState["image"];
}

export interface SetProtocolAction {
  type: CreateFunctionModalActionType.SET_PROTOCOL;
  payload: InvocationProtocol;
}

export interface SetCommandAction {
  type: CreateFunctionModalActionType.SET_COMMAND;
  payload: CreateFunctionModalState["command"];
}

export interface SetEnvAction {
  type: CreateFunctionModalActionType.SET_ENV;
  payload: CreateFunctionModalState["env"];
}

export interface SetContractKindAction {
  type: CreateFunctionModalActionType.SET_CONTRACT_KIND;
  payload: FunctionContractKind;
}

export interface SetSchemaTextAction {
  type: CreateFunctionModalActionType.SET_SCHEMA_TEXT;
  payload: { side: CreateFunctionModalContractSide; text: string };
}

export interface AddArrowFieldAction {
  type: CreateFunctionModalActionType.ADD_ARROW_FIELD;
  payload: { side: CreateFunctionModalContractSide; field: CreateFunctionModalArrowField };
}

export interface UpdateArrowFieldAction {
  type: CreateFunctionModalActionType.UPDATE_ARROW_FIELD;
  payload: {
    side: CreateFunctionModalContractSide;
    id: CreateFunctionModalArrowField["id"];
    partial: Partial<CreateFunctionModalArrowField>;
  };
}

export interface RemoveArrowFieldAction {
  type: CreateFunctionModalActionType.REMOVE_ARROW_FIELD;
  payload: { side: CreateFunctionModalContractSide; id: CreateFunctionModalArrowField["id"] };
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
  | SetImageAction
  | SetProtocolAction
  | SetCommandAction
  | SetEnvAction
  | SetContractKindAction
  | SetSchemaTextAction
  | AddArrowFieldAction
  | UpdateArrowFieldAction
  | RemoveArrowFieldAction
  | SetVcpusAction
  | SetMemoryMibAction
  | SetTimeoutMsAction
  | GoToStepAction
  | GoBackAction
  | GoNextAction
  | SetSubmittingAction;
