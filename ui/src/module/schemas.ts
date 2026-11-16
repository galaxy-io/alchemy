import z from "zod";

import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import { InvocationsTimeframe } from "@/components/invocations/types";

import type { FunctionContractKind } from "@/pages/functions/types";
import {
  ObservabilityRefreshInterval,
  ObservabilityTrafficFill,
} from "@/pages/observability/types";

import { Flow } from "@/module/types";

export const listSearchParamsSchema = z.object({
  q: z.string().optional().catch(undefined),
});

export type ListSearchParams = z.infer<typeof listSearchParamsSchema>;

const flowContractArrowFieldsSchema = z.array(
  z.object({ name: z.string().min(1), type: z.string().min(1), nullable: z.boolean() }),
);

const flowContractSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("arrow" satisfies FunctionContractKind),
    input: flowContractArrowFieldsSchema,
    output: flowContractArrowFieldsSchema,
  }),
  z.object({
    kind: z.literal("jsonSchema" satisfies FunctionContractKind),
    input: z.string(),
    output: z.string(),
  }),
]);

export type AlchemyFlowContract = z.infer<typeof flowContractSchema>;

export const alchemyLayoutSearchSchema = z.object({
  flow: z.enum(Flow).optional().catch(undefined),
  functionId: z.string().optional().catch(undefined),
  functionName: z.string().optional().catch(undefined),
  functionDescription: z.string().optional().catch(undefined),
  runtime: z.string().optional().catch(undefined),
  contract: flowContractSchema.optional().catch(undefined),
  returnTo: z.string().optional().catch(undefined),
  returnLabel: z.string().optional().catch(undefined),
  invocationId: z.string().optional().catch(undefined),
  invocationAttempt: z.coerce.number().int().positive().optional().catch(undefined),
});

export type AlchemyLayoutSearch = z.infer<typeof alchemyLayoutSearchSchema>;

export type AlchemyFlowSeed = Omit<
  AlchemyLayoutSearch,
  "flow" | "invocationId" | "invocationAttempt"
>;

export const observabilitySearchSchema = z.object({
  timeframe: z.enum(InvocationsTimeframe).optional().catch(undefined),
  traffic: z.enum(ObservabilityTrafficFill).optional().catch(undefined),
  refreshInterval: z.enum(ObservabilityRefreshInterval).optional().catch(undefined),
  invocationsBucket: z.coerce.bigint().positive().optional().catch(undefined),
  invocationsStatus: z.enum(InvocationStatus).optional().catch(undefined),
});

export type ObservabilitySearch = z.infer<typeof observabilitySearchSchema>;

export const functionsSearchSchema = listSearchParamsSchema;

export const functionParamsSchema = z.object({ id: z.string() });

export const functionSearchSchema = z.object({
  version: z.coerce.bigint().positive().optional().catch(undefined),
});

export type FunctionSearch = z.infer<typeof functionSearchSchema>;

export const invocationsSearchSchema = z.object({
  timeframe: z.enum(InvocationsTimeframe).optional().catch(undefined),
  statuses: z.array(z.enum(InvocationStatus)).optional().catch(undefined),
});

export type InvocationsSearch = z.infer<typeof invocationsSearchSchema>;

export const functionWorkbenchSearchSchema = z.object({
  file: z.string().optional().catch(undefined),
});

export type FunctionWorkbenchSearch = z.infer<typeof functionWorkbenchSearchSchema>;

export const alchemyReturnSearchSchema = z.object({
  alchemyFunctionId: z.string().min(1),
  alchemyFunctionVersion: z.coerce.bigint().positive(),
});

export type AlchemyReturnSearch = z.infer<typeof alchemyReturnSearchSchema>;
