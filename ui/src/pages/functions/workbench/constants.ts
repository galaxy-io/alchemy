import type { JsonValue } from "@bufbuild/protobuf";

export const FUNCTION_WORKBENCH_PLAYGROUND_STORAGE_KEY = "alchemy:playground";

export const FUNCTION_WORKBENCH_PLAYGROUND_INPUT_DEFAULT_HEIGHT = 240;
export const FUNCTION_WORKBENCH_PLAYGROUND_INPUT_MIN_HEIGHT = 96;
export const FUNCTION_WORKBENCH_PLAYGROUND_INPUT_MAX_HEIGHT = 720;

export const FUNCTION_WORKBENCH_RESULT_ID_LENGTH = 14;

export const FUNCTION_WORKBENCH_DEFAULT_INPUT: JsonValue = { text: "hello, alchemy" };
