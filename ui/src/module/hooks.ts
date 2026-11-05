import { useCallback } from "react";

import {
  type UseNavigateResult,
  useMatches,
  useMatchRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import { INVOCATIONS_DEFAULT_TIMEFRAME } from "@/components/invocations/constants";

import { FUNCTION_WORKBENCH_DEFAULT_FILE } from "@/pages/functions/workbench/constants";
import {
  OBSERVABILITY_DEFAULT_REFRESH_INTERVAL,
  OBSERVABILITY_DEFAULT_TRAFFIC_FILL,
} from "@/pages/observability/constants";

import type { AlchemyPath } from "@/module/paths";
import {
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
    (flow: Flow, functionId?: AlchemyFunction["id"]) =>
      void updateSearch((prev) => ({ ...prev, invocationId: undefined, flow, functionId })),
    [updateSearch],
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
      return {
        timeframe: parsed.timeframe ?? INVOCATIONS_DEFAULT_TIMEFRAME,
        traffic: parsed.traffic ?? OBSERVABILITY_DEFAULT_TRAFFIC_FILL,
        refreshInterval: parsed.refreshInterval ?? OBSERVABILITY_DEFAULT_REFRESH_INTERVAL,
        invocationsBucket: parsed.invocationsBucket,
        invocationsStatus: parsed.invocationsStatus,
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
