import type { InvokeResponse } from "@/gen/functions/v1/invocations_pb";

export interface FunctionWorkbenchPlaygroundState {
  text: string;
  response: InvokeResponse | undefined;
}
