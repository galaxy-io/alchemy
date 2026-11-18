import { match } from "ts-pattern";

import {
  type AddArrowFieldAction,
  type CreateFunctionModalAction,
  CreateFunctionModalActionType,
  type GoToStepAction,
  type RemoveArrowFieldAction,
  type SetCommandAction,
  type SetContractKindAction,
  type SetDescriptionAction,
  type SetImageAction,
  type SetMaxConcurrencyAction,
  type SetMemoryMibAction,
  type SetNameAction,
  type SetNetworkAction,
  type SetRetriesAction,
  type SetRuntimeAction,
  type SetSchemaTextAction,
  type SetSecretsAction,
  type SetSourceFileAction,
  type SetSourceFileContentAction,
  type SetSourceKindAction,
  type SetStoredSecretsAction,
  type SetSubmittingAction,
  type SetTemplateAction,
  type SetTimeoutMsAction,
  type SetVariablesAction,
  type SetVcpusAction,
  type UpdateArrowFieldAction,
} from "@/pages/functions/components/create/actions";
import {
  type CreateFunctionModalState,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import {
  applyCreateFunctionModalTemplate,
  clearCreateFunctionModalTemplate,
  createCreateFunctionModalTemplateFiles,
  getCreateFunctionModalRuntime,
  getCreateFunctionModalSteps,
  getCreateFunctionModalTemplate,
} from "@/pages/functions/components/create/utils";
import { FunctionSourceKind } from "@/pages/functions/types";
import { createFunctionSourceStarter } from "@/pages/functions/utils";

function regenerateRuntimeStarter(state: CreateFunctionModalState): CreateFunctionModalState {
  const runtime = getCreateFunctionModalRuntime(state);
  if (state.isSourceTouched || !runtime) return state;
  const sourceFiles = createFunctionSourceStarter(runtime, state.contractKind);
  return {
    ...state,
    sourceFiles,
    sourceFile: sourceFiles[0]?.path ?? state.sourceFile,
    sourceContractKind: state.contractKind,
  };
}

function regenerateTemplateFiles(state: CreateFunctionModalState): CreateFunctionModalState {
  const template = getCreateFunctionModalTemplate(state);
  if (state.isSourceTouched || !template) return state;
  const sourceFiles = createCreateFunctionModalTemplateFiles(template, state.contractKind);
  return {
    ...state,
    sourceFiles,
    sourceFile: sourceFiles[0]?.path ?? state.sourceFile,
    sourceContractKind: state.contractKind,
  };
}

function regenerateStarter(state: CreateFunctionModalState): CreateFunctionModalState {
  return match(state.sourceKind)
    .with(FunctionSourceKind.SOURCE, () => regenerateRuntimeStarter(state))
    .with(FunctionSourceKind.TEMPLATE, () => regenerateTemplateFiles(state))
    .with(FunctionSourceKind.IMAGE, () => state)
    .exhaustive();
}

function enterStep(state: CreateFunctionModalState, step: CreateFunctionModalStep) {
  const next = { ...state, step };
  return step === CreateFunctionModalStep.CODE ? regenerateStarter(next) : next;
}

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

function setSourceKind(
  state: CreateFunctionModalState,
  action: SetSourceKindAction,
): CreateFunctionModalState {
  if (action.payload === state.sourceKind) return state;
  const next = { ...state, sourceKind: action.payload };
  const template = state.templates[0];
  return match(action.payload)
    .with(FunctionSourceKind.TEMPLATE, () =>
      template && state.contractCaller === undefined
        ? applyCreateFunctionModalTemplate(next, template)
        : state,
    )
    .with(FunctionSourceKind.SOURCE, FunctionSourceKind.IMAGE, () =>
      regenerateStarter(clearCreateFunctionModalTemplate(next)),
    )
    .exhaustive();
}

function setTemplate(
  state: CreateFunctionModalState,
  action: SetTemplateAction,
): CreateFunctionModalState {
  const template = state.templates.find((candidate) => candidate.id === action.payload);
  return template && template.id !== state.template
    ? applyCreateFunctionModalTemplate(state, template)
    : state;
}

function setRuntime(
  state: CreateFunctionModalState,
  action: SetRuntimeAction,
): CreateFunctionModalState {
  return regenerateStarter({ ...state, runtime: action.payload });
}

function setSourceFile(
  state: CreateFunctionModalState,
  action: SetSourceFileAction,
): CreateFunctionModalState {
  return { ...state, sourceFile: action.payload };
}

function setSourceFileContent(
  state: CreateFunctionModalState,
  action: SetSourceFileContentAction,
): CreateFunctionModalState {
  return {
    ...state,
    isSourceTouched: true,
    sourceContractKind: state.contractKind,
    sourceFiles: state.sourceFiles.map((file) =>
      file.path === action.payload.path ? action.payload : file,
    ),
  };
}

function setCommand(
  state: CreateFunctionModalState,
  action: SetCommandAction,
): CreateFunctionModalState {
  return { ...state, command: action.payload };
}

function setVariables(
  state: CreateFunctionModalState,
  action: SetVariablesAction,
): CreateFunctionModalState {
  return { ...state, variables: action.payload };
}

function setStoredSecrets(
  state: CreateFunctionModalState,
  action: SetStoredSecretsAction,
): CreateFunctionModalState {
  return { ...state, stored: action.payload };
}

function setSecrets(
  state: CreateFunctionModalState,
  action: SetSecretsAction,
): CreateFunctionModalState {
  return { ...state, secrets: action.payload };
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

function setMaxConcurrency(
  state: CreateFunctionModalState,
  action: SetMaxConcurrencyAction,
): CreateFunctionModalState {
  return { ...state, maxConcurrency: action.payload };
}

function setRetries(
  state: CreateFunctionModalState,
  action: SetRetriesAction,
): CreateFunctionModalState {
  return { ...state, retries: action.payload };
}

function setNetwork(
  state: CreateFunctionModalState,
  action: SetNetworkAction,
): CreateFunctionModalState {
  return { ...state, network: action.payload };
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
  const steps = getCreateFunctionModalSteps(state.mode, state.sourceKind);
  const index = steps.indexOf(action.payload);
  if (state.isSubmitting || index === -1 || index > steps.indexOf(state.step)) return state;
  return enterStep(state, action.payload);
}

function goBack(state: CreateFunctionModalState): CreateFunctionModalState {
  const steps = getCreateFunctionModalSteps(state.mode, state.sourceKind);
  return enterStep(state, steps[Math.max(steps.indexOf(state.step) - 1, 0)] ?? state.step);
}

function goNext(state: CreateFunctionModalState): CreateFunctionModalState {
  const steps = getCreateFunctionModalSteps(state.mode, state.sourceKind);
  return enterStep(
    state,
    steps[Math.min(steps.indexOf(state.step) + 1, steps.length - 1)] ?? state.step,
  );
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
    case CreateFunctionModalActionType.SET_SOURCE_KIND:
      return setSourceKind(state, action);
    case CreateFunctionModalActionType.SET_IMAGE:
      return setImage(state, action);
    case CreateFunctionModalActionType.SET_RUNTIME:
      return setRuntime(state, action);
    case CreateFunctionModalActionType.SET_TEMPLATE:
      return setTemplate(state, action);
    case CreateFunctionModalActionType.SET_SOURCE_FILE:
      return setSourceFile(state, action);
    case CreateFunctionModalActionType.SET_SOURCE_FILE_CONTENT:
      return setSourceFileContent(state, action);
    case CreateFunctionModalActionType.SET_COMMAND:
      return setCommand(state, action);
    case CreateFunctionModalActionType.SET_VARIABLES:
      return setVariables(state, action);
    case CreateFunctionModalActionType.SET_SECRETS:
      return setSecrets(state, action);
    case CreateFunctionModalActionType.SET_STORED_SECRETS:
      return setStoredSecrets(state, action);
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
    case CreateFunctionModalActionType.SET_MAX_CONCURRENCY:
      return setMaxConcurrency(state, action);
    case CreateFunctionModalActionType.SET_RETRIES:
      return setRetries(state, action);
    case CreateFunctionModalActionType.SET_NETWORK:
      return setNetwork(state, action);
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
