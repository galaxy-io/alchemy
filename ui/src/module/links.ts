import { defaultStringifySearch } from "@tanstack/react-router";

import { type AlchemyFlowSeed, AlchemyPath, createAlchemyFlowSearch, Flow } from "@/module/paths";
import { type AlchemyReturnSearch, alchemyReturnSearchSchema } from "@/module/schemas";

export type { AlchemyFlowContract, AlchemyReturnSearch } from "@/module/schemas";

export type AlchemyFunctionLinkSeed = Pick<
  AlchemyFlowSeed,
  "functionName" | "functionDescription" | "runtime" | "contract" | "returnLabel"
>;

export const createAlchemyFunctionHref = (
  alchemyUrl: string,
  returnTo: string,
  seed: AlchemyFunctionLinkSeed = {},
) =>
  `${alchemyUrl}${AlchemyPath.FUNCTIONS.slice(1)}${defaultStringifySearch(
    createAlchemyFlowSearch(Flow.CREATE_FUNCTION, { ...seed, returnTo }),
  )}`;

export const parseAlchemyReturnSearch = (
  search: Record<string, unknown>,
): AlchemyReturnSearch | undefined => alchemyReturnSearchSchema.safeParse(search).data;
