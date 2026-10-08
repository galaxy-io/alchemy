import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  useContext,
  useMemo,
  useReducer,
} from "react";

import type { InvocationProtocol } from "@/gen/functions/v1/common_pb";
import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import {
  type CreateFunctionModalAction,
  CreateFunctionModalActionType,
} from "@/pages/functions/components/create/actions";
import {
  CREATE_FUNCTION_MODAL_DEFAULT_ARROW_TYPE,
  CREATE_FUNCTION_MODAL_MODE_TO_STEP_ORDER_MAP,
  CREATE_FUNCTION_MODAL_STEP_TO_HINT_MAP,
} from "@/pages/functions/components/create/constants";
import createFunctionModalReducer from "@/pages/functions/components/create/reducer";
import { mapCreateFunctionModalStateToSpec } from "@/pages/functions/components/create/serialize";
import {
  type CreateFunctionModalArrowField,
  type CreateFunctionModalContextValue,
  CreateFunctionModalContractSide,
  type CreateFunctionModalState,
  type CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import {
  createInitialState,
  getCreateFunctionModalStepHints,
} from "@/pages/functions/components/create/utils";
import type { FunctionContractKind } from "@/pages/functions/types";
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
      setImage: (payload: CreateFunctionModalState["image"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_IMAGE, payload }),
      setProtocol: (payload: InvocationProtocol) =>
        dispatch({ type: CreateFunctionModalActionType.SET_PROTOCOL, payload }),
      setCommand: (payload: CreateFunctionModalState["command"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_COMMAND, payload }),
      setEnv: (payload: CreateFunctionModalState["env"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_ENV, payload }),
      setContractKind: (payload: FunctionContractKind) =>
        dispatch({ type: CreateFunctionModalActionType.SET_CONTRACT_KIND, payload }),
      setSchemaText: (side: CreateFunctionModalContractSide, text: string) =>
        dispatch({ type: CreateFunctionModalActionType.SET_SCHEMA_TEXT, payload: { side, text } }),
      addArrowField: (side: CreateFunctionModalContractSide) =>
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
        side: CreateFunctionModalContractSide,
        id: CreateFunctionModalArrowField["id"],
        partial: Partial<CreateFunctionModalArrowField>,
      ) =>
        dispatch({
          type: CreateFunctionModalActionType.UPDATE_ARROW_FIELD,
          payload: { side, id, partial },
        }),
      removeArrowField: (
        side: CreateFunctionModalContractSide,
        id: CreateFunctionModalArrowField["id"],
      ) =>
        dispatch({ type: CreateFunctionModalActionType.REMOVE_ARROW_FIELD, payload: { side, id } }),
      setVcpus: (payload: CreateFunctionModalState["vcpus"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_VCPUS, payload }),
      setMemoryMib: (payload: CreateFunctionModalState["memoryMib"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_MEMORY_MIB, payload }),
      setTimeoutMs: (payload: CreateFunctionModalState["timeoutMs"]) =>
        dispatch({ type: CreateFunctionModalActionType.SET_TIMEOUT_MS, payload }),
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

interface CreateFunctionModalProviderProps {
  fn?: AlchemyFunction;
}

const CreateFunctionModalProvider = ({
  fn,
  children,
}: PropsWithChildren<CreateFunctionModalProviderProps>) => {
  const [state, dispatch] = useReducer(createFunctionModalReducer, fn, createInitialState);

  const value = useMemo<CreateFunctionModalContextValue>(() => {
    const steps = CREATE_FUNCTION_MODAL_MODE_TO_STEP_ORDER_MAP[state.mode];
    const stepIndex = steps.indexOf(state.step);
    const name = state.name.trim();
    const nameError = state.isNameTouched || name === "" ? getFunctionNameError(name) : undefined;
    const schemaErrors = {
      [CreateFunctionModalContractSide.INPUT]:
        state.contractKind === "jsonSchema"
          ? getFunctionSchemaError(state.schemaTexts[CreateFunctionModalContractSide.INPUT])
          : undefined,
      [CreateFunctionModalContractSide.OUTPUT]:
        state.contractKind === "jsonSchema"
          ? getFunctionSchemaError(state.schemaTexts[CreateFunctionModalContractSide.OUTPUT])
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
