import { useCallback } from "react";

import {
  type UseNavigateResult,
  useMatches,
  useMatchRoute,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from "@tanstack/react-router";

import { INVOCATIONS_DEFAULT_TIMEFRAME } from "@/components/invocations/constants";

import { FUNCTION_WORKBENCH_DEFAULT_FILE } from "@/pages/functions/workbench/constants";
import {
  OBSERVABILITY_DEFAULT_INVOCATIONS_GROUP,
  OBSERVABILITY_DEFAULT_REFRESH_INTERVAL,
  OBSERVABILITY_DEFAULT_TRAFFIC_FILL,
} from "@/pages/observability/constants";
import { ObservabilityInvocationsGroup } from "@/pages/observability/types";

import {
  type AlchemyPath,
  type AlchemyReturnSearch,
  createAlchemyFlowSearch,
} from "@/module/paths";
import {
  type AlchemyFlowSeed,
  type AlchemyLayoutSearch,
  alchemyLayoutSearchSchema,
  functionParamsSchema,
  functionSearchSchema,
  functionsSearchSchema,
  functionWorkbenchSearchSchema,
  invocationsSearchSchema,
  listSearchParamsSchema,
  observabilitySearchSchema,
} from "@/module/schemas";
import type { Flow } from "@/module/types";

const ROOT_PATH = "/";

interface AlchemySearchUpdateOptions {
  replace?: boolean;
}

interface AlchemyMatchRouteOptions {
  params?: Record<string, string>;
  fuzzy?: boolean;
}

export const useAlchemyMountedBase = () =>
  useMatches({
    select: (matches): string | undefined =>
      matches.find((match) => match.staticData.alchemy)?.fullPath,
  });

export const useAlchemyBase = (fallback?: string) =>
  (useAlchemyMountedBase() ?? fallback ?? ROOT_PATH) as typeof ROOT_PATH;

export const useAlchemyNavigate = (fallback?: string): UseNavigateResult<typeof ROOT_PATH> => {
  const base = useAlchemyBase(fallback);
  return useNavigate({ from: base });
};

export const useAlchemySearchUpdate = <TSearch extends object>() => {
  const navigate = useNavigate();
  return useCallback(
    (update: (prev: TSearch) => TSearch, { replace = false }: AlchemySearchUpdateOptions = {}) =>
      navigate({ to: ".", replace, search: update as never }),
    [navigate],
  );
};

export const useAlchemyFlowOpen = () => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  return useCallback(
    (flow: Flow, seed?: AlchemyFlowSeed) =>
      void updateSearch((prev) => ({
        ...prev,
        ...createAlchemyFlowSearch(flow, seed),
        invocationId: undefined,
        invocationAttempt: undefined,
      })),
    [updateSearch],
  );
};

export const useAlchemyReturn = () => {
  const router = useRouter();
  return useCallback(
    (returnUrl: URL, result?: AlchemyReturnSearch) => {
      const url = new URL(returnUrl);
      for (const [key, value] of Object.entries(result ?? {})) {
        url.searchParams.set(key, String(value));
      }
      if (url.origin === window.location.origin) {
        router.history.replace(`${url.pathname}${url.search}${url.hash}`);
        return;
      }
      window.location.replace(url.href);
    },
    [router],
  );
};

export const useAlchemyMatchRoute = () => {
  const base = useAlchemyBase();
  const matchRoute = useMatchRoute();
  return useCallback(
    (to: AlchemyPath, { params, fuzzy = false }: AlchemyMatchRouteOptions = {}) =>
      matchRoute({ from: base, to, params, fuzzy } as Parameters<typeof matchRoute>[0]) !== false,
    [base, matchRoute],
  );
};

export const useAlchemyLayoutSearch = () =>
  useSearch({
    strict: false,
    structuralSharing: true,
    select: (search) => alchemyLayoutSearchSchema.parse(search),
  });

export const useListSearch = () =>
  useSearch({
    strict: false,
    structuralSharing: true,
    select: (search) => listSearchParamsSchema.parse(search),
  });

export const useObservabilitySearch = () =>
  useSearch({
    strict: false,
    structuralSharing: true,
    select: (search) => {
      const parsed = observabilitySearchSchema.parse(search);
      const invocationsGroup = parsed.invocationsGroup ?? OBSERVABILITY_DEFAULT_INVOCATIONS_GROUP;
      return {
        timeframe: parsed.timeframe ?? INVOCATIONS_DEFAULT_TIMEFRAME,
        traffic: parsed.traffic ?? OBSERVABILITY_DEFAULT_TRAFFIC_FILL,
        refreshInterval: parsed.refreshInterval ?? OBSERVABILITY_DEFAULT_REFRESH_INTERVAL,
        invocationsBucket: parsed.invocationsBucket,
        invocationsGroup,
        invocationsStatus:
          invocationsGroup === ObservabilityInvocationsGroup.STATUS
            ? parsed.invocationsStatus
            : undefined,
        invocationsFunction:
          invocationsGroup === ObservabilityInvocationsGroup.FUNCTION
            ? parsed.invocationsFunction
            : undefined,
      };
    },
  });

export const useFunctionsSearch = () =>
  useSearch({
    strict: false,
    structuralSharing: true,
    select: (search) => functionsSearchSchema.parse(search),
  });

export const useFunctionSearch = () =>
  useSearch({
    strict: false,
    structuralSharing: true,
    select: (search) => functionSearchSchema.parse(search),
  });

export const useInvocationsSearch = () =>
  useSearch({
    strict: false,
    structuralSharing: true,
    select: (search) => {
      const parsed = invocationsSearchSchema.parse(search);
      return {
        timeframe: parsed.timeframe ?? INVOCATIONS_DEFAULT_TIMEFRAME,
        statuses: parsed.statuses ?? [],
      };
    },
  });

export const useFunctionWorkbenchSearch = () =>
  useSearch({
    strict: false,
    structuralSharing: true,
    select: (search) => ({
      file: functionWorkbenchSearchSchema.parse(search).file ?? FUNCTION_WORKBENCH_DEFAULT_FILE,
    }),
  });

export const useFunctionParams = () =>
  useParams({ strict: false, select: (params) => functionParamsSchema.parse(params) });
