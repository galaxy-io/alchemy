import type { JsonObject } from "@bufbuild/protobuf";
import { HammerIcon, type Icon, PlusIcon } from "@phosphor-icons/react";

import {
  type CreateFunctionModalArrowField,
  CreateFunctionModalMode,
  type CreateFunctionModalState,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import type { FunctionContractKind } from "@/pages/functions/types";
import { FunctionContractSide } from "@/pages/functions/types";

import { formatJson } from "@/utils/json";

export const CREATE_FUNCTION_MODAL_SIDEBAR_WIDTH = 240;
export const CREATE_FUNCTION_MODAL_RESOURCES_MAX_WIDTH = 560;
export const CREATE_FUNCTION_MODAL_ARROW_TYPE_WIDTH = 180;
export const CREATE_FUNCTION_MODAL_DESCRIPTION_MIN_ROWS = 12;

export const CREATE_FUNCTION_MODAL_MODE_TO_STEP_ORDER_MAP: Record<
  CreateFunctionModalMode,
  CreateFunctionModalStep[]
> = {
  [CreateFunctionModalMode.FUNCTION]: [
    CreateFunctionModalStep.RUNTIME,
    CreateFunctionModalStep.CONTRACT,
    CreateFunctionModalStep.RESOURCES,
    CreateFunctionModalStep.DETAILS,
  ],
  [CreateFunctionModalMode.VERSION]: [
    CreateFunctionModalStep.RUNTIME,
    CreateFunctionModalStep.CONTRACT,
    CreateFunctionModalStep.RESOURCES,
  ],
};

export const CREATE_FUNCTION_MODAL_STEP_TO_TITLE_MAP: Record<CreateFunctionModalStep, string> = {
  [CreateFunctionModalStep.RUNTIME]: "Choose image",
  [CreateFunctionModalStep.CONTRACT]: "Define contract",
  [CreateFunctionModalStep.RESOURCES]: "Set resources",
  [CreateFunctionModalStep.DETAILS]: "Name image",
};

export const CREATE_FUNCTION_MODAL_STEP_TO_DESCRIPTION_MAP: Record<
  CreateFunctionModalStep,
  string
> = {
  [CreateFunctionModalStep.RUNTIME]:
    "Point at the OCI image to run, and override its command or environment if you need to.",
  [CreateFunctionModalStep.CONTRACT]:
    "Describe what the image takes and returns. Every invocation is checked against it.",
  [CreateFunctionModalStep.RESOURCES]: "Size the microVM each invocation runs in.",
  [CreateFunctionModalStep.DETAILS]:
    "Name your image and add an optional description so your team knows what it does.",
};

export const CREATE_FUNCTION_MODAL_STEP_TO_HINT_MAP: Record<CreateFunctionModalStep, string> = {
  [CreateFunctionModalStep.RUNTIME]: "Choose an image",
  [CreateFunctionModalStep.CONTRACT]: "Fix the schemas",
  [CreateFunctionModalStep.RESOURCES]: "Fix the limits",
  [CreateFunctionModalStep.DETAILS]: "Enter a valid image name",
};

export const CREATE_FUNCTION_MODAL_STEP_TO_IS_PADDED_MAP: Record<CreateFunctionModalStep, boolean> =
  {
    [CreateFunctionModalStep.RUNTIME]: true,
    [CreateFunctionModalStep.CONTRACT]: false,
    [CreateFunctionModalStep.RESOURCES]: true,
    [CreateFunctionModalStep.DETAILS]: true,
  };

export const CREATE_FUNCTION_MODAL_MODE_TO_HEADER_MAP: Record<CreateFunctionModalMode, string> = {
  [CreateFunctionModalMode.FUNCTION]: "New image",
  [CreateFunctionModalMode.VERSION]: "New version",
};

export const CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_LABEL_MAP: Record<
  CreateFunctionModalMode,
  string
> = {
  [CreateFunctionModalMode.FUNCTION]: "Create image",
  [CreateFunctionModalMode.VERSION]: "Build version",
};

export const CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_ICON_MAP: Record<CreateFunctionModalMode, Icon> =
  {
    [CreateFunctionModalMode.FUNCTION]: PlusIcon,
    [CreateFunctionModalMode.VERSION]: HammerIcon,
  };

export const CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP: Record<
  FunctionContractSide,
  string
> = {
  [FunctionContractSide.INPUT]: "Input",
  [FunctionContractSide.OUTPUT]: "Output",
};

export const CREATE_FUNCTION_MODAL_CONTRACT_SIDES = Object.values(FunctionContractSide);

export const CREATE_FUNCTION_MODAL_CONTRACT_KINDS: FunctionContractKind[] = ["jsonSchema", "arrow"];

export const CREATE_FUNCTION_MODAL_IMAGE_PATTERN =
  /^[a-z0-9.\-_/]+(:[\w.-]+)?(@sha256:[a-f0-9]{64})?$/;

export const CREATE_FUNCTION_MODAL_VCPUS_MIN = 1;
export const CREATE_FUNCTION_MODAL_VCPUS_MAX = 8;
export const CREATE_FUNCTION_MODAL_VCPUS_MARKS = [1, 2, 4, 8];
export const CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN = 64;
export const CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX = 8192;
export const CREATE_FUNCTION_MODAL_MEMORY_MIB_STEP = 64;
export const CREATE_FUNCTION_MODAL_MEMORY_MIB_MARKS = [64, 2048, 4096, 8192];
export const CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS = 1_000;
export const CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS = 300_000;

export const CREATE_FUNCTION_MODAL_DEFAULT_ARROW_TYPE = "utf8";

export const CREATE_FUNCTION_MODAL_ARROW_TYPES = [
  "utf8",
  "int32",
  "int64",
  "float32",
  "float64",
  "bool",
  "timestamp[us]",
  "date32",
  "binary",
  "list<utf8>",
  "fixed_size_list<float32>[384]",
];

const CREATE_FUNCTION_MODAL_DEFAULT_SCHEMA: JsonObject = { type: "object" };

const CREATE_FUNCTION_MODAL_DEFAULT_ARROW_FIELDS: Record<
  FunctionContractSide,
  CreateFunctionModalArrowField[]
> = {
  [FunctionContractSide.INPUT]: [{ id: "in_id", name: "id", type: "utf8", nullable: false }],
  [FunctionContractSide.OUTPUT]: [{ id: "out_id", name: "id", type: "utf8", nullable: false }],
};

export const CREATE_FUNCTION_MODAL_DEFAULT_STATE: CreateFunctionModalState = {
  mode: CreateFunctionModalMode.FUNCTION,
  functionId: undefined,
  step: CreateFunctionModalStep.RUNTIME,
  name: "",
  isNameTouched: false,
  description: "",
  image: "",
  command: [],
  env: [],
  contractKind: "jsonSchema",
  schemaTexts: {
    [FunctionContractSide.INPUT]: formatJson(CREATE_FUNCTION_MODAL_DEFAULT_SCHEMA),
    [FunctionContractSide.OUTPUT]: formatJson(CREATE_FUNCTION_MODAL_DEFAULT_SCHEMA),
  },
  arrowFields: CREATE_FUNCTION_MODAL_DEFAULT_ARROW_FIELDS,
  vcpus: 1,
  memoryMib: 256,
  timeoutMs: 30_000,
  isSubmitting: false,
};
