import { useMemo } from "react";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import { useGetFunctionsQueries } from "@/api/queries/functions";

export const useObservabilityFunctionsById = (ids: AlchemyFunction["id"][]) => {
  const { functions, isLoading } = useGetFunctionsQueries({ ids });

  const functionsById = useMemo(
    () => new Map(functions.map((alchemyFunction) => [alchemyFunction.id, alchemyFunction])),
    [functions],
  );

  return { functionsById, isLoading };
};
