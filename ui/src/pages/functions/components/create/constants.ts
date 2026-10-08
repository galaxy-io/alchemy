import type { JsonObject } from "@bufbuild/protobuf";
import { CheckIcon, HammerIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";

import { InvocationProtocol } from "@/gen/functions/v1/common_pb";

import {
  type CreateFunctionModalArrowField,
  CreateFunctionModalContractSide,
  CreateFunctionModalMode,
  type CreateFunctionModalState,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import type { FunctionContractKind } from "@/pages/functions/types";

import { formatJson } from "@/utils/json";

export const CREATE_FUNCTION_MODAL_SIDEBAR_WIDTH = 232;
export const CREATE_FUNCTION_MODAL_RESOURCES_MAX_WIDTH = 560;
export const CREATE_FUNCTION_MODAL_REVIEW_MAX_WIDTH = 640;
export const CREATE_FUNCTION_MODAL_ARROW_TYPE_WIDTH = 200;

export const CREATE_FUNCTION_MODAL_MODE_TO_STEP_ORDER_MAP: Record<
  CreateFunctionModalMode,
  CreateFunctionModalStep[]
> = {
  [CreateFunctionModalMode.FUNCTION]: [
    CreateFunctionModalStep.DETAILS,
    CreateFunctionModalStep.RUNTIME,
    CreateFunctionModalStep.CONTRACT,
    CreateFunctionModalStep.RESOURCES,
    CreateFunctionModalStep.REVIEW,
  ],
  [CreateFunctionModalMode.VERSION]: [
    CreateFunctionModalStep.RUNTIME,
    CreateFunctionModalStep.CONTRACT,
    CreateFunctionModalStep.RESOURCES,
    CreateFunctionModalStep.REVIEW,
  ],
};

export const CREATE_FUNCTION_MODAL_STEP_TO_TITLE_MAP: Record<CreateFunctionModalStep, string> = {
  [CreateFunctionModalStep.DETAILS]: "Basics",
  [CreateFunctionModalStep.RUNTIME]: "Runtime",
  [CreateFunctionModalStep.CONTRACT]: "Contract",
  [CreateFunctionModalStep.RESOURCES]: "Resources",
  [CreateFunctionModalStep.REVIEW]: "Review",
};

export const CREATE_FUNCTION_MODAL_STEP_TO_DESCRIPTION_MAP: Record<
  CreateFunctionModalStep,
  string
> = {
  [CreateFunctionModalStep.DETAILS]:
    "The handle callers invoke. Everything else lives on versions.",
  [CreateFunctionModalStep.RUNTIME]: "The image to boot and how the supervisor talks to it.",
  [CreateFunctionModalStep.CONTRACT]: "Input and output are checked against this on every call.",
  [CreateFunctionModalStep.RESOURCES]: "The microVM's size and the run-time limit.",
  [CreateFunctionModalStep.REVIEW]: "What will be built.",
};

export const CREATE_FUNCTION_MODAL_STEP_TO_HINT_MAP: Record<CreateFunctionModalStep, string> = {
  [CreateFunctionModalStep.DETAILS]: "Enter a name",
  [CreateFunctionModalStep.RUNTIME]: "Choose an image",
  [CreateFunctionModalStep.CONTRACT]: "Fix the schemas",
  [CreateFunctionModalStep.RESOURCES]: "Fix the limits",
  [CreateFunctionModalStep.REVIEW]: "",
};

export const CREATE_FUNCTION_MODAL_STEP_TO_PADDING_MAP: Record<CreateFunctionModalStep, 0 | 16> = {
  [CreateFunctionModalStep.DETAILS]: 16,
  [CreateFunctionModalStep.RUNTIME]: 16,
  [CreateFunctionModalStep.CONTRACT]: 0,
  [CreateFunctionModalStep.RESOURCES]: 16,
  [CreateFunctionModalStep.REVIEW]: 16,
};

export const CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_LABEL_MAP: Record<
  CreateFunctionModalMode,
  string
> = {
  [CreateFunctionModalMode.FUNCTION]: "Create function",
  [CreateFunctionModalMode.VERSION]: "Build version",
};

export const CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_ICON_MAP: Record<
  CreateFunctionModalMode,
  PhosphorIcon
> = {
  [CreateFunctionModalMode.FUNCTION]: CheckIcon,
  [CreateFunctionModalMode.VERSION]: HammerIcon,
};

export const CREATE_FUNCTION_MODAL_MODE_TO_REVIEW_HEADER_MAP: Record<
  CreateFunctionModalMode,
  string
> = {
  [CreateFunctionModalMode.FUNCTION]: "Version 1 starts building",
  [CreateFunctionModalMode.VERSION]: "A new version starts building",
};

export const CREATE_FUNCTION_MODAL_MODE_TO_REVIEW_DESCRIPTION_MAP: Record<
  CreateFunctionModalMode,
  string
> = {
  [CreateFunctionModalMode.FUNCTION]: "The image is invokable once the build is ready.",
  [CreateFunctionModalMode.VERSION]: "It becomes current once the build is ready.",
};

export const CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP: Record<
  CreateFunctionModalContractSide,
  string
> = {
  [CreateFunctionModalContractSide.INPUT]: "Input",
  [CreateFunctionModalContractSide.OUTPUT]: "Output",
};

export const CREATE_FUNCTION_MODAL_CONTRACT_SIDES = Object.values(CreateFunctionModalContractSide);

export const CREATE_FUNCTION_MODAL_CONTRACT_KINDS: FunctionContractKind[] = ["jsonSchema", "arrow"];

export const CREATE_FUNCTION_MODAL_PROTOCOLS = Object.values(InvocationProtocol).filter(
  (protocol): protocol is InvocationProtocol =>
    typeof protocol === "number" && protocol !== InvocationProtocol.UNSPECIFIED,
);

export const CREATE_FUNCTION_MODAL_IMAGE_PATTERN =
  /^[a-z0-9.\-_/]+(:[\w.-]+)?(@sha256:[a-f0-9]{64})?$/;

export const CREATE_FUNCTION_MODAL_VCPUS_MIN = 1;
export const CREATE_FUNCTION_MODAL_VCPUS_MAX = 16;
export const CREATE_FUNCTION_MODAL_VCPUS_SLIDER_MAX = 8;
export const CREATE_FUNCTION_MODAL_VCPUS_MARKS = [1, 2, 4, 8];
export const CREATE_FUNCTION_MODAL_MEMORY_MIB_MIN = 64;
export const CREATE_FUNCTION_MODAL_MEMORY_MIB_MAX = 16384;
export const CREATE_FUNCTION_MODAL_MEMORY_MIB_SLIDER_MAX = 8192;
export const CREATE_FUNCTION_MODAL_MEMORY_MIB_STEP = 64;
export const CREATE_FUNCTION_MODAL_MEMORY_MIB_MARKS = [64, 2048, 4096, 8192];
export const CREATE_FUNCTION_MODAL_TIMEOUT_MIN_MS = 1_000;
export const CREATE_FUNCTION_MODAL_TIMEOUT_MAX_MS = 900_000;

export const CREATE_FUNCTION_MODAL_DEFAULT_RESOURCES = { vcpus: 1, memoryMib: 256 };
export const CREATE_FUNCTION_MODAL_DEFAULT_TIMEOUT_MS = 30_000;

export const CREATE_FUNCTION_MODAL_DEFAULT_CONTRACT: Record<
  CreateFunctionModalContractSide,
  JsonObject
> = {
  [CreateFunctionModalContractSide.INPUT]: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      text: { type: "string", description: "The text to transform." },
    },
    required: ["text"],
    additionalProperties: false,
  },
  [CreateFunctionModalContractSide.OUTPUT]: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      text: { type: "string" },
      length: { type: "integer", minimum: 0 },
    },
    required: ["text", "length"],
    additionalProperties: false,
  },
};

export const CREATE_FUNCTION_MODAL_DEFAULT_ARROW_FIELDS: Record<
  CreateFunctionModalContractSide,
  CreateFunctionModalArrowField[]
> = {
  [CreateFunctionModalContractSide.INPUT]: [
    { id: "in_id", name: "id", type: "utf8", nullable: false },
  ],
  [CreateFunctionModalContractSide.OUTPUT]: [
    { id: "out_id", name: "id", type: "utf8", nullable: false },
  ],
};

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

export const CREATE_FUNCTION_MODAL_DEFAULT_STATE: CreateFunctionModalState = {
  mode: CreateFunctionModalMode.FUNCTION,
  functionId: null,
  step: CreateFunctionModalStep.DETAILS,
  name: "",
  isNameTouched: false,
  description: "",
  image: "",
  command: [],
  env: [],
  protocol: InvocationProtocol.EXEC,
  contractKind: "jsonSchema",
  schemaTexts: {
    [CreateFunctionModalContractSide.INPUT]: formatJson(
      CREATE_FUNCTION_MODAL_DEFAULT_CONTRACT[CreateFunctionModalContractSide.INPUT],
    ),
    [CreateFunctionModalContractSide.OUTPUT]: formatJson(
      CREATE_FUNCTION_MODAL_DEFAULT_CONTRACT[CreateFunctionModalContractSide.OUTPUT],
    ),
  },
  arrowFields: CREATE_FUNCTION_MODAL_DEFAULT_ARROW_FIELDS,
  vcpus: CREATE_FUNCTION_MODAL_DEFAULT_RESOURCES.vcpus,
  memoryMib: CREATE_FUNCTION_MODAL_DEFAULT_RESOURCES.memoryMib,
  timeoutMs: CREATE_FUNCTION_MODAL_DEFAULT_TIMEOUT_MS,
  isSubmitting: false,
};
