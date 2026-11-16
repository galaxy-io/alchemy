import z from "zod";

export const hostRuntimeConfigSchema = z.object({
  returnOrigins: z.array(z.string()).optional().catch(undefined),
});

export type HostRuntimeConfig = z.infer<typeof hostRuntimeConfigSchema>;
