import {
  createContext,
  type Dispatch,
  type FC,
  type PropsWithChildren,
  useContext,
  useMemo,
  useReducer,
} from "react";

import type { Runtime } from "@/gen/functions/v1/functions_pb";

import {
  type CreateFunctionModalAction,
  CreateFunctionModalActionType,
} from "@/pages/functions/components/create/actions";
import {
  CREATE_FUNCTION_MODAL_DEFAULT_ARROW_TYPE,
  CREATE_FUNCTION_MODAL_STEP_TO_HINT_MAP,
} from "@/pages/functions/components/create/constants";
import createFunctionModalReducer from "@/pages/functions/components/create/reducer";
import { mapCreateFunctionModalStateToSpec } from "@/pages/functions/components/create/serialize";
import type {
  CreateFunctionModalArrowField,
  CreateFunctionModalContextValue,
  CreateFunctionModalState,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import {
  type CreateFunctionModalSeed,
  createInitialCreateFunctionModalState,
  getCreateFunctionModalStepHints,
  getCreateFunctionModalSteps,
} from "@/pages/functions/components/create/utils";
import type {
  FunctionContractKind,
  FunctionSourceFile,
  FunctionSourceKind,
} from "@/pages/functions/types";
import { FunctionContractSide } from "@/pages/functions/types";
import { getFunctionNameError, getFunctionSchemaError } from "@/pages/functions/utils";

const CreateFunctionModalStateContext = createContext<CreateFunctionModalContextValue | null>(null);
CreateFunctionModalStateContext.displayName = "CreateFunctionModalStateContext";

const CreateFunctionModalDispatchContext =
  createContext<Dispatch<CreateFunctionModalAction> | null>(null);
CreateFunctionModalDispatchContext.displayName = "CreateFunctionModalDispatchContext";

export const useCreateFunctionModalState = () => {
  const state = useContext(CreateFunctionModalStateContext);
  if (!state) {
    throw new Error("useCreateFunctionModalState must be used within CreateFunctionModalProvider");
  }
  return state;
};

const useCreateFunctionModalDispatch = () => {
  const dispatch = useContext(CreateFunctionModalDispatchContext);
  if (!dispatch) {
    throw new Error(
      "useCreateFunctionModalDispatch must be used within CreateFunctionModalProvider",
    );
  }
  return dispatch;
};

export const useCreateFunctionModalActions = () => {
  const dispatch = useCreateFunctionModalDispatch();
  return useMemo(
    () => ({
      setName: (payload: CreateFunctionModalState["name"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_NAME, payload }),
      setDescription: (payload: CreateFunctionModalState["description"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_DESCRIPTION, payload }),
      setSourceKind: (payload: FunctionSourceKind) =>
        dispatch({ type: CreateFunctionModalActionType.SET_SOURCE_KIND, payload }),
      setImage: (payload: CreateFunctionModalState["image"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_IMAGE, payload }),
      setRuntime: (payload: Runtime["id"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_RUNTIME, payload }),
      setSourceFile: (payload: FunctionSourceFile["path"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_SOURCE_FILE, payload }),
      setSourceFileContent: (payload: FunctionSourceFile) =>
        dispatch({ type: CreateFunctionModalActionType.SET_SOURCE_FILE_CONTENT, payload }),
      setCommand: (payload: CreateFunctionModalState["command"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_COMMAND, payload }),
      setVariables: (payload: CreateFunctionModalState["variables"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_VARIABLES, payload }),
      setSecrets: (payload: CreateFunctionModalState["secrets"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_SECRETS, payload }),
      setContractKind: (payload: FunctionContractKind) =>
        dispatch({ type: CreateFunctionModalActionType.SET_CONTRACT_KIND, payload }),
      setSchemaText: (side: FunctionContractSide, text: string) =>
        dispatch({ type: CreateFunctionModalActionType.SET_SCHEMA_TEXT, payload: { side, text } }),
      addArrowField: (side: FunctionContractSide) =>
        dispatch({
          type: CreateFunctionModalActionType.ADD_ARROW_FIELD,
          payload: {
            side,
            field: {
              id: crypto.randomUUID(),
              name: "",
              type: CREATE_FUNCTION_MODAL_DEFAULT_ARROW_TYPE,
              nullable: true,
            },
          },
        }),
      updateArrowField: (
        side: FunctionContractSide,
        id: CreateFunctionModalArrowField["id"],
        partial: Partial<CreateFunctionModalArrowField>,
      ) =>
        dispatch({
          type: CreateFunctionModalActionType.UPDATE_ARROW_FIELD,
          payload: { side, id, partial },
        }),
      removeArrowField: (side: FunctionContractSide, id: CreateFunctionModalArrowField["id"]) =>
        dispatch({ type: CreateFunctionModalActionType.REMOVE_ARROW_FIELD, payload: { side, id } }),
      setVcpus: (payload: CreateFunctionModalState["vcpus"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_VCPUS, payload }),
      setMemoryMib: (payload: CreateFunctionModalState["memoryMib"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_MEMORY_MIB, payload }),
      setTimeoutMs: (payload: CreateFunctionModalState["timeoutMs"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_TIMEOUT_MS, payload }),
      setMaxConcurrency: (payload: CreateFunctionModalState["maxConcurrency"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_MAX_CONCURRENCY, payload }),
      goToStep: (payload: CreateFunctionModalStep) =>
        dispatch({ type: CreateFunctionModalActionType.GO_TO_STEP, payload }),
      goBack: () => dispatch({ type: CreateFunctionModalActionType.GO_BACK }),
      goNext: () => dispatch({ type: CreateFunctionModalActionType.GO_NEXT }),
      setSubmitting: (payload: boolean) =>
        dispatch({ type: CreateFunctionModalActionType.SET_SUBMITTING, payload }),
    }),
    [dispatch],
  );
};

const CreateFunctionModalProvider: FC<PropsWithChildren<CreateFunctionModalSeed>> = ({
  alchemyFunction,
  version,
  runtimes,
  limits,
  children,
}) => {
  const [state, dispatch] = useReducer(
    createFunctionModalReducer,
    { alchemyFunction, version, runtimes, limits },
    createInitialCreateFunctionModalState,
  );

  const value = useMemo<CreateFunctionModalContextValue>(() => {
    const steps = getCreateFunctionModalSteps(state.mode, state.sourceKind);
    const stepIndex = steps.indexOf(state.step);
    const name = state.name.trim();
    const nameError = state.isNameTouched || !name ? getFunctionNameError(name) : undefined;
    const isJsonSchema = state.contractKind === "jsonSchema";
    const schemaErrors = {
      [FunctionContractSide.INPUT]: isJsonSchema
        ? getFunctionSchemaError(state.schemaTexts[FunctionContractSide.INPUT])
        : undefined,
      [FunctionContractSide.OUTPUT]: isJsonSchema
        ? getFunctionSchemaError(state.schemaTexts[FunctionContractSide.OUTPUT])
        : undefined,
    };
    const stepHints = getCreateFunctionModalStepHints(state, { nameError, schemaErrors });
    const isNextDisabled = stepHints.length > 0 || state.isSubmitting;
    const fallbackHint = CREATE_FUNCTION_MODAL_STEP_TO_HINT_MAP[state.step];

    return {
      ...state,
      steps,
      stepIndex,
      isFirstStep: stepIndex === 0,
      isLastStep: stepIndex === steps.length - 1,
      isNextDisabled,
      hints: stepHints.length ? stepHints : isNextDisabled && fallbackHint ? [fallbackHint] : [],
      nameError,
      schemaErrors,
      spec: mapCreateFunctionModalStateToSpec(state),
    };
  }, [state]);

  return (
    <CreateFunctionModalDispatchContext.Provider value={dispatch}>
      <CreateFunctionModalStateContext.Provider value={value}>
        {children}
      </CreateFunctionModalStateContext.Provider>
    </CreateFunctionModalDispatchContext.Provider>
  );
};

export default CreateFunctionModalProvider;
