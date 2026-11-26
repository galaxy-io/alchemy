import { useMemo } from "react";

import { create } from "@bufbuild/protobuf";

import { ListFunctionsRequestSchema } from "@/gen/functions/v1/functions_pb";

import { OBSERVABILITY_INVOCATIONS_FUNCTIONS_PAGE_SIZE } from "@/pages/observability/components/invocations/constants";

import { useListFunctionsQuery } from "@/api/queries/functions";

const OBSERVABILITY_FUNCTIONS_INPUT = create(ListFunctionsRequestSchema, {
  pagination: { pageSize: OBSERVABILITY_INVOCATIONS_FUNCTIONS_PAGE_SIZE },
});

export const useObservabilityFunctionsById = (isEnabled: boolean) => {
  const { data, isLoading } = useListFunctionsQuery({
    input: OBSERVABILITY_FUNCTIONS_INPUT,
    options: { enabled: isEnabled },
  });

  const functionsById = useMemo(
    () =>
      new Map(
        (data?.functions ?? []).map((alchemyFunction) => [alchemyFunction.id, alchemyFunction]),
      ),
    [data],
  );

  return { functionsById, isLoading: isEnabled && isLoading };
};
