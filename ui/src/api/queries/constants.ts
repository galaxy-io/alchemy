import { FunctionVersionStatus } from "@/gen/functions/v1/functions_pb";
import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

export const ACTIVE_INVOCATION_STATUSES = new Set<InvocationStatus>([
  InvocationStatus.PENDING,
  InvocationStatus.STARTING,
  InvocationStatus.RUNNING,
]);

export const ACTIVE_FUNCTION_VERSION_STATUSES = new Set<FunctionVersionStatus>([
  FunctionVersionStatus.BUILDING,
]);
