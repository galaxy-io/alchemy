import type { AlchemyFlowSeed, AlchemyLayoutSearch } from "@/module/schemas";
import { Flow } from "@/module/types";

export type { AlchemyFlowContract, AlchemyFlowSeed, AlchemyReturnSearch } from "@/module/schemas";

export { Flow };

export enum AlchemyPath {
  OBSERVABILITY = "./observability",
  FUNCTIONS = "./functions",
  FUNCTION = "./functions/$id",
  FUNCTION_WORKBENCH = "./functions/$id/workbench",
  FUNCTION_CONTRACT = "./functions/$id/contract",
  FUNCTION_VERSIONS = "./functions/$id/versions",
  FUNCTION_INVOCATIONS = "./functions/$id/invocations",
  FUNCTION_SETTINGS = "./functions/$id/settings",
  HOSTS = "./hosts",
  INVOCATIONS = "./invocations",
}

export const createAlchemyHref = (path: AlchemyPath, params: Record<string, string> = {}) =>
  path.replace(/\$(\w+)/g, (_, key: string) => encodeURIComponent(params[key] ?? ""));

const ALCHEMY_FLOW_SEARCH_RESET: { [K in keyof Required<AlchemyFlowSeed>]: undefined } = {
  functionId: undefined,
  functionName: undefined,
  functionDescription: undefined,
  runtime: undefined,
  contract: undefined,
  returnTo: undefined,
  returnLabel: undefined,
};

export const createAlchemyFlowSearch = (
  flow?: Flow,
  seed: AlchemyFlowSeed = {},
): Omit<AlchemyLayoutSearch, "invocationId" | "invocationAttempt"> => ({
  ...ALCHEMY_FLOW_SEARCH_RESET,
  ...seed,
  flow,
});
