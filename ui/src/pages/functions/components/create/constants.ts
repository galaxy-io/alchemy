import type { JsonObject } from "@bufbuild/protobuf";
import { CodeIcon, CubeIcon, HammerIcon, type Icon, PlusIcon } from "@phosphor-icons/react";

import {
  type CreateFunctionModalArrowField,
  CreateFunctionModalMode,
  type CreateFunctionModalState,
  CreateFunctionModalStep,
} from "@/pages/functions/components/create/types";
import type { FunctionContractKind } from "@/pages/functions/types";
import { FunctionContractSide, FunctionSourceKind } from "@/pages/functions/types";

import { formatMemory } from "@/utils/format";
import { formatJson } from "@/utils/json";

export const CREATE_FUNCTION_MODAL_RESOURCES_MAX_WIDTH = 560;
export const CREATE_FUNCTION_MODAL_ARROW_TYPE_WIDTH = 180;
export const CREATE_FUNCTION_MODAL_DESCRIPTION_MIN_ROWS = 12;
export const CREATE_FUNCTION_MODAL_SOURCE_TOOLTIP_MAX_WIDTH = 320;

export const CREATE_FUNCTION_MODAL_STEPS: CreateFunctionModalStep[] = [
  CreateFunctionModalStep.SOURCE,
  CreateFunctionModalStep.CONTRACT,
  CreateFunctionModalStep.CODE,
  CreateFunctionModalStep.RESOURCES,
  CreateFunctionModalStep.DETAILS,
];

export const CREATE_FUNCTION_MODAL_MODE_TO_SKIPPED_STEPS_MAP: Record<
  CreateFunctionModalMode,
  CreateFunctionModalStep[]
> = {
  [CreateFunctionModalMode.FUNCTION]: [],
  [CreateFunctionModalMode.VERSION]: [
    CreateFunctionModalStep.RESOURCES,
    CreateFunctionModalStep.DETAILS,
  ],
};

export const CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_SKIPPED_STEPS_MAP: Record<
  FunctionSourceKind,
  CreateFunctionModalStep[]
> = {
  [FunctionSourceKind.SOURCE]: [],
  [FunctionSourceKind.IMAGE]: [CreateFunctionModalStep.CODE],
};

export const CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_ICON_MAP: Record<FunctionSourceKind, Icon> = {
  [FunctionSourceKind.SOURCE]: CodeIcon,
  [FunctionSourceKind.IMAGE]: CubeIcon,
};

export const CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_DESCRIPTION_MAP: Record<
  FunctionSourceKind,
  string
> = {
  [FunctionSourceKind.SOURCE]: "Write it here and Alchemy builds it",
  [FunctionSourceKind.IMAGE]: "Run an OCI image you build",
};

export const CREATE_FUNCTION_MODAL_SOURCE_KIND_TO_DETAILS_MAP: Record<FunctionSourceKind, string> =
  {
    [FunctionSourceKind.SOURCE]:
      "Write the handler here. It lands on a runtime image with the language and Arrow in it, and Alchemy builds the version from it.",
    [FunctionSourceKind.IMAGE]:
      "Point at an OCI image you build and push yourself. Its entrypoint reads input on stdin and writes output on stdout.",
  };

export const CREATE_FUNCTION_MODAL_STEP_TO_TITLE_MAP: Record<CreateFunctionModalStep, string> = {
  [CreateFunctionModalStep.SOURCE]: "Choose source",
  [CreateFunctionModalStep.CONTRACT]: "Define contract",
  [CreateFunctionModalStep.CODE]: "Write code",
  [CreateFunctionModalStep.RESOURCES]: "Set resources",
  [CreateFunctionModalStep.DETAILS]: "Name function",
};

export const CREATE_FUNCTION_MODAL_STEP_TO_DESCRIPTION_MAP: Record<
  CreateFunctionModalStep,
  string
> = {
  [CreateFunctionModalStep.SOURCE]:
    "Write the function here and Alchemy builds it, or point at an OCI image you already ship.",
  [CreateFunctionModalStep.CONTRACT]:
    "Describe what the function takes and returns. Every invocation is checked against it.",
  [CreateFunctionModalStep.CODE]:
    "Start from the handler your contract generated. It reads one input on stdin and writes one output on stdout.",
  [CreateFunctionModalStep.RESOURCES]: "Size the microVM each invocation runs in.",
  [CreateFunctionModalStep.DETAILS]:
    "Name your function and add an optional description so your team knows what it does.",
};

export const CREATE_FUNCTION_MODAL_STEP_TO_HINT_MAP: Record<CreateFunctionModalStep, string> = {
  [CreateFunctionModalStep.SOURCE]: "Choose a source",
  [CreateFunctionModalStep.CONTRACT]: "Fix the schemas",
  [CreateFunctionModalStep.CODE]: "Write the handler",
  [CreateFunctionModalStep.RESOURCES]: "Fix the limits",
  [CreateFunctionModalStep.DETAILS]: "Enter a valid function name",
};

export const CREATE_FUNCTION_MODAL_STEP_TO_IS_PADDED_MAP: Record<CreateFunctionModalStep, boolean> =
  {
    [CreateFunctionModalStep.SOURCE]: true,
    [CreateFunctionModalStep.CONTRACT]: false,
    [CreateFunctionModalStep.CODE]: false,
    [CreateFunctionModalStep.RESOURCES]: true,
    [CreateFunctionModalStep.DETAILS]: true,
  };

export const CREATE_FUNCTION_MODAL_MODE_TO_HEADER_MAP: Record<CreateFunctionModalMode, string> = {
  [CreateFunctionModalMode.FUNCTION]: "New function",
  [CreateFunctionModalMode.VERSION]: "New version",
};

export const CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_LABEL_MAP: Record<
  CreateFunctionModalMode,
  string
> = {
  [CreateFunctionModalMode.FUNCTION]: "Create function",
  [CreateFunctionModalMode.VERSION]: "Build version",
};

export const CREATE_FUNCTION_MODAL_MODE_TO_SUBMIT_ICON_MAP: Record<CreateFunctionModalMode, Icon> =
  {
    [CreateFunctionModalMode.FUNCTION]: PlusIcon,
    [CreateFunctionModalMode.VERSION]: HammerIcon,
  };

export const CREATE_FUNCTION_MODAL_CONTRACT_DEFAULT_CALLER = "the calling app";

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
  "timestamp[us, tz=UTC]",
  "date32",
  "time64[us]",
  "decimal128(38, 9)",
  "binary",
  "list<utf8>",
  "fixed_size_list<float32>[384]",
];

const CREATE_FUNCTION_MODAL_DEFAULT_SCHEMA: JsonObject = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
};

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
  step: CreateFunctionModalStep.SOURCE,
  name: "",
  isNameTouched: false,
  description: "",
  sourceKind: FunctionSourceKind.SOURCE,
  image: "",
  runtimes: [],
  limits: undefined,
  runtime: "",
  sourceFiles: [],
  sourceFile: "",
  isSourceTouched: false,
  command: [],
  variables: [],
  secrets: [],
  secretNames: {},
  contractKind: "jsonSchema",
  contractCaller: undefined,
  schemaTexts: {
    [FunctionContractSide.INPUT]: formatJson(CREATE_FUNCTION_MODAL_DEFAULT_SCHEMA),
    [FunctionContractSide.OUTPUT]: formatJson(CREATE_FUNCTION_MODAL_DEFAULT_SCHEMA),
  },
  arrowFields: CREATE_FUNCTION_MODAL_DEFAULT_ARROW_FIELDS,
  vcpus: 1,
  memoryMib: 256,
  timeoutMs: 30_000,
  maxConcurrency: null,
  retries: 2,
  isSubmitting: false,
};

export const CREATE_FUNCTION_MODAL_ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const CREATE_FUNCTION_MODAL_SECRETS_KEPT_DESCRIPTION =
  "Leave a stored secret blank to keep its current value";
export const CREATE_FUNCTION_MODAL_VARIABLE_DESCRIPTION = "Plain text, stored with the version";
export const CREATE_FUNCTION_MODAL_SECRET_DESCRIPTION = "Encrypted at rest, hidden once saved";

export const CREATE_FUNCTION_MODAL_SOURCE_KIND_NAME = "create-function-source-kind";
export const CREATE_FUNCTION_MODAL_COMMAND_SEPARATORS = [" ", ","];

export const CREATE_FUNCTION_MODAL_VCPUS_SLIDER_MARKS = CREATE_FUNCTION_MODAL_VCPUS_MARKS.map(
  (value) => ({
    value,
    label: String(value),
  }),
);

export const CREATE_FUNCTION_MODAL_MEMORY_SLIDER_MARKS = CREATE_FUNCTION_MODAL_MEMORY_MIB_MARKS.map(
  (value) => ({ value, label: formatMemory(value) }),
);

export const CREATE_FUNCTION_MODAL_RETRIES_MIN = 0;
export const CREATE_FUNCTION_MODAL_RETRIES_MAX = 10;
