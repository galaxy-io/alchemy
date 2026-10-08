import { z } from "zod";

import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import { InvocationsTimeframe } from "@/pages/invocations/types";
import { ObservabilityTrafficFill } from "@/pages/observability/types";

import { listSearchParamsSchema } from "@/api/utils";

import { Flow } from "@/module/types";

export const alchemyLayoutSearchSchema = z.object({
  flow: z.enum(Flow).optional().catch(undefined),
  functionId: z.string().optional().catch(undefined),
  invocationId: z.string().optional().catch(undefined),
});

export type AlchemyLayoutSearch = z.infer<typeof alchemyLayoutSearchSchema>;

export const observabilitySearchSchema = z.object({
  timeframe: z.enum(InvocationsTimeframe).optional().catch(undefined),
  traffic: z.enum(ObservabilityTrafficFill).optional().catch(undefined),
});

export type ObservabilitySearch = z.infer<typeof observabilitySearchSchema>;

export const functionsSearchSchema = listSearchParamsSchema;

export type FunctionsSearch = z.infer<typeof functionsSearchSchema>;

export const functionSearchSchema = z.object({
  version: z.coerce.bigint().positive().optional().catch(undefined),
});

export type FunctionSearch = z.infer<typeof functionSearchSchema>;

export const functionInvocationsSearchSchema = z.object({
  timeframe: z.enum(InvocationsTimeframe).optional().catch(undefined),
  statuses: z.array(z.enum(InvocationStatus)).optional().catch(undefined),
});

export type FunctionInvocationsSearch = z.infer<typeof functionInvocationsSearchSchema>;

export const invocationsSearchSchema = listSearchParamsSchema.extend({
  timeframe: z.enum(InvocationsTimeframe).optional().catch(undefined),
  statuses: z.array(z.enum(InvocationStatus)).optional().catch(undefined),
});

export type InvocationsSearch = z.infer<typeof invocationsSearchSchema>;
