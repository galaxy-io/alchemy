import {
  type AddArrowFieldAction,
  type CreateFunctionModalAction,
  CreateFunctionModalActionType,
  type GoToStepAction,
  type RemoveArrowFieldAction,
  type SetCommandAction,
  type SetContractKindAction,
  type SetDescriptionAction,
  type SetEnvAction,
  type SetImageAction,
  type SetMemoryMibAction,
  type SetNameAction,
  type SetSchemaTextAction,
  type SetSubmittingAction,
  type SetTimeoutMsAction,
  type SetVcpusAction,
  type UpdateArrowFieldAction,
} from "@/pages/functions/components/create/actions";
import { CREATE_FUNCTION_MODAL_MODE_TO_STEP_ORDER_MAP } from "@/pages/functions/components/create/constants";
import type { CreateFunctionModalState } from "@/pages/functions/components/create/types";

function setName(state: CreateFunctionModalState, action: SetNameAction): CreateFunctionModalState {
  return { ...state, name: action.payload, isNameTouched: true };
}

function setDescription(
  state: CreateFunctionModalState,
  action: SetDescriptionAction,
): CreateFunctionModalState {
  return { ...state, description: action.payload };
}

function setImage(
  state: CreateFunctionModalState,
  action: SetImageAction,
): CreateFunctionModalState {
  return { ...state, image: action.payload };
}

function setCommand(
  state: CreateFunctionModalState,
  action: SetCommandAction,
): CreateFunctionModalState {
  return { ...state, command: action.payload };
}

function setEnv(state: CreateFunctionModalState, action: SetEnvAction): CreateFunctionModalState {
  return { ...state, env: action.payload };
}

function setContractKind(
  state: CreateFunctionModalState,
  action: SetContractKindAction,
): CreateFunctionModalState {
  return { ...state, contractKind: action.payload };
}

function setVcpus(
  state: CreateFunctionModalState,
  action: SetVcpusAction,
): CreateFunctionModalState {
  return { ...state, vcpus: action.payload };
}

function setMemoryMib(
  state: CreateFunctionModalState,
  action: SetMemoryMibAction,
): CreateFunctionModalState {
  return { ...state, memoryMib: action.payload };
}

function setTimeoutMs(
  state: CreateFunctionModalState,
  action: SetTimeoutMsAction,
): CreateFunctionModalState {
  return { ...state, timeoutMs: action.payload };
}

function setSubmitting(
  state: CreateFunctionModalState,
  action: SetSubmittingAction,
): CreateFunctionModalState {
  return { ...state, isSubmitting: action.payload };
}

function setSchemaText(
  state: CreateFunctionModalState,
  action: SetSchemaTextAction,
): CreateFunctionModalState {
  const { side, text } = action.payload;
  return { ...state, schemaTexts: { ...state.schemaTexts, [side]: text } };
}

function addArrowField(
  state: CreateFunctionModalState,
  action: AddArrowFieldAction,
): CreateFunctionModalState {
  const { side, field } = action.payload;
  return {
    ...state,
    arrowFields: { ...state.arrowFields, [side]: [...state.arrowFields[side], field] },
  };
}

function updateArrowField(
  state: CreateFunctionModalState,
  action: UpdateArrowFieldAction,
): CreateFunctionModalState {
  const { side, id, partial } = action.payload;
  return {
    ...state,
    arrowFields: {
      ...state.arrowFields,
      [side]: state.arrowFields[side].map((field) =>
        field.id === id ? { ...field, ...partial } : field,
      ),
    },
  };
}

function removeArrowField(
  state: CreateFunctionModalState,
  action: RemoveArrowFieldAction,
): CreateFunctionModalState {
  const { side, id } = action.payload;
  return {
    ...state,
    arrowFields: {
      ...state.arrowFields,
      [side]: state.arrowFields[side].filter((field) => field.id !== id),
    },
  };
}

function goToStep(
  state: CreateFunctionModalState,
  action: GoToStepAction,
): CreateFunctionModalState {
  const steps = CREATE_FUNCTION_MODAL_MODE_TO_STEP_ORDER_MAP[state.mode];
  const index = steps.indexOf(action.payload);
  if (state.isSubmitting || index === -1 || index > steps.indexOf(state.step)) return state;
  return { ...state, step: action.payload };
}

function goBack(state: CreateFunctionModalState): CreateFunctionModalState {
  const steps = CREATE_FUNCTION_MODAL_MODE_TO_STEP_ORDER_MAP[state.mode];
  return { ...state, step: steps[Math.max(steps.indexOf(state.step) - 1, 0)] ?? state.step };
}

function goNext(state: CreateFunctionModalState): CreateFunctionModalState {
  const steps = CREATE_FUNCTION_MODAL_MODE_TO_STEP_ORDER_MAP[state.mode];
  return {
    ...state,
    step: steps[Math.min(steps.indexOf(state.step) + 1, steps.length - 1)] ?? state.step,
  };
}

const createFunctionModalReducer = (
  state: CreateFunctionModalState,
  action: CreateFunctionModalAction,
): CreateFunctionModalState => {
  switch (action.type) {
    case CreateFunctionModalActionType.SET_NAME:
      return setName(state, action);
    case CreateFunctionModalActionType.SET_DESCRIPTION:
      return setDescription(state, action);
    case CreateFunctionModalActionType.SET_IMAGE:
      return setImage(state, action);
    case CreateFunctionModalActionType.SET_COMMAND:
      return setCommand(state, action);
    case CreateFunctionModalActionType.SET_ENV:
      return setEnv(state, action);
    case CreateFunctionModalActionType.SET_CONTRACT_KIND:
      return setContractKind(state, action);
    case CreateFunctionModalActionType.SET_SCHEMA_TEXT:
      return setSchemaText(state, action);
    case CreateFunctionModalActionType.ADD_ARROW_FIELD:
      return addArrowField(state, action);
    case CreateFunctionModalActionType.UPDATE_ARROW_FIELD:
      return updateArrowField(state, action);
    case CreateFunctionModalActionType.REMOVE_ARROW_FIELD:
      return removeArrowField(state, action);
    case CreateFunctionModalActionType.SET_VCPUS:
      return setVcpus(state, action);
    case CreateFunctionModalActionType.SET_MEMORY_MIB:
      return setMemoryMib(state, action);
    case CreateFunctionModalActionType.SET_TIMEOUT_MS:
      return setTimeoutMs(state, action);
    case CreateFunctionModalActionType.GO_TO_STEP:
      return goToStep(state, action);
    case CreateFunctionModalActionType.GO_BACK:
      return goBack(state);
    case CreateFunctionModalActionType.GO_NEXT:
      return goNext(state);
    case CreateFunctionModalActionType.SET_SUBMITTING:
      return setSubmitting(state, action);
  }
};

export default createFunctionModalReducer;
