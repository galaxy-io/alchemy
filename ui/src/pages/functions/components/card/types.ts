import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";
import type { Invocation } from "@/gen/functions/v1/invocations_pb";

export interface FunctionCardRow {
  fn: AlchemyFunction;
  recentInvocations: Invocation[];
  count24h: number;
  successRate: number | null;
  p50Us: number | null;
}
