import type { InvokeResponse } from "@/gen/functions/v1/invocations_pb";

export enum FunctionWorkbenchFile {
  INPUT = "INPUT",
  CONTRACT_INPUT = "CONTRACT_INPUT",
  CONTRACT_OUTPUT = "CONTRACT_OUTPUT",
  SPEC = "SPEC",
}

export interface FunctionWorkbenchState {
  text: string;
  response: InvokeResponse | undefined;
}
