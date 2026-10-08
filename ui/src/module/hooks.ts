import { useCallback } from "react";

import {
  useMatches,
  useMatchRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";

import type {
  AlchemyLayoutSearch,
  FunctionInvocationsSearch,
  FunctionSearch,
  FunctionsSearch,
  InvocationsSearch,
  ObservabilitySearch,
} from "@/module/schemas";

const ROOT_PATH = "/";

type AlchemyParams = Record<string, string | number | bigint>;

/** The full path of the route that mounts `alchemyLayoutRoute`, or `undefined` outside the module. */
export const useAlchemyMountedBase = (): string | undefined =>
  useMatches().find((match) => match.staticData.alchemy)?.fullPath;

/**
 * The full path of the route that mounts `alchemyLayoutRoute` (`/` standalone, `/functions` inside a
 * host that mounts the module under a prefix). Every path the module navigates to is relative to it.
 * The literal type is a lie the router's generics need; the runtime value is the host's.
 */
export const useAlchemyBase = () => (useAlchemyMountedBase() ?? ROOT_PATH) as typeof ROOT_PATH;

/** `useNavigate` bound to the module's base, so `to` is written relative (`./images/$id`). */
export const useAlchemyNavigate = () => {
  const base = useAlchemyBase();
  return useNavigate({ from: base });
};

interface AlchemySearchUpdateOptions {
  replace?: boolean;
}

/**
 * Writes the current route's search params, typed by the module's own schemas like the reads below:
 * the module cannot name the host's routes, so the router cannot type `prev` for it.
 */
export const useAlchemySearchUpdate = <TSearch extends object>() => {
  const navigate = useNavigate();
  return useCallback(
    (update: (prev: TSearch) => TSearch, { replace = false }: AlchemySearchUpdateOptions = {}) =>
      navigate({ to: ".", replace, search: update as never }),
    [navigate],
  );
};

/** Whether the current location matches `to`, resolved against the module's base. */
export const useAlchemyMatchRoute = () => {
  const base = useAlchemyBase();
  const matchRoute = useMatchRoute();
  return (to: string, params?: AlchemyParams, fuzzy = false): boolean =>
    matchRoute({ from: base, to, params, fuzzy } as Parameters<typeof matchRoute>[0]) !== false;
};

// The module cannot name the host's route ids, so reads are loose and typed by the module's own
// schemas. Every validated param above the screen is merged in, which is why the layout search is
// readable from any screen.
export const useFunctionParams = () => useParams({ strict: false }) as { id: string };

export const useAlchemyLayoutSearch = () => useSearch({ strict: false }) as AlchemyLayoutSearch;

export const useObservabilitySearch = () => useSearch({ strict: false }) as ObservabilitySearch;

export const useFunctionsSearch = () => useSearch({ strict: false }) as FunctionsSearch;

export const useFunctionSearch = () => useSearch({ strict: false }) as FunctionSearch;

export const useFunctionInvocationsSearch = () =>
  useSearch({ strict: false }) as FunctionInvocationsSearch;

export const useInvocationsSearch = () => useSearch({ strict: false }) as InvocationsSearch;
