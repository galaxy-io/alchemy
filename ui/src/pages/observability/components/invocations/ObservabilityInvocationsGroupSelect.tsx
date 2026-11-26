import type { FC } from "react";

import SelectInput, {
  SelectInputSize,
  SelectInputVariant,
} from "@galaxy-io/dls/inputs/SelectInput";
import Box from "@galaxy-io/dls/layout/Box";

import {
  OBSERVABILITY_INVOCATIONS_GROUP_OPTIONS,
  OBSERVABILITY_INVOCATIONS_GROUP_SELECT_WIDTH,
} from "@/pages/observability/components/invocations/constants";
import { OBSERVABILITY_DEFAULT_INVOCATIONS_GROUP } from "@/pages/observability/constants";
import { ObservabilityInvocationsGroup } from "@/pages/observability/types";

import { useAlchemySearchUpdate, useObservabilitySearch } from "@/module/hooks";
import type { ObservabilitySearch } from "@/module/schemas";

const ObservabilityInvocationsGroupSelect: FC = () => {
  const { invocationsGroup } = useObservabilitySearch();
  const updateSearch = useAlchemySearchUpdate<ObservabilitySearch>();

  const handleChange = (id: ObservabilityInvocationsGroup | null) => {
    const nextGroup = id ?? ObservabilityInvocationsGroup.NONE;
    void updateSearch(
      (prev) => ({
        ...prev,
        invocationsGroup:
          nextGroup === OBSERVABILITY_DEFAULT_INVOCATIONS_GROUP ? undefined : nextGroup,
        invocationsStatus: undefined,
        invocationsFunction: undefined,
      }),
      { replace: true },
    );
  };

  return (
    <Box width={OBSERVABILITY_INVOCATIONS_GROUP_SELECT_WIDTH}>
      <SelectInput
        fillWidth
        options={OBSERVABILITY_INVOCATIONS_GROUP_OPTIONS}
        value={invocationsGroup === ObservabilityInvocationsGroup.NONE ? null : invocationsGroup}
        size={SelectInputSize.SMALL}
        variant={SelectInputVariant.PRIMARY}
        onChange={handleChange}
        isClearable
        placeholder="Group..."
        ariaLabel="Group by"
      />
    </Box>
  );
};

export default ObservabilityInvocationsGroupSelect;
