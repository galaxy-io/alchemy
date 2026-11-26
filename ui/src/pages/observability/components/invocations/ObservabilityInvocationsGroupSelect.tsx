import type { FC } from "react";

import SelectInput, {
  SelectInputSize,
  SelectInputVariant,
} from "@galaxy-io/dls/inputs/SelectInput";
import Box from "@galaxy-io/dls/layout/Box";

import { MetricDimension } from "@/gen/metrics/v1/metrics_pb";

import {
  OBSERVABILITY_INVOCATIONS_GROUP_OPTIONS,
  OBSERVABILITY_INVOCATIONS_GROUP_SELECT_WIDTH,
} from "@/pages/observability/components/invocations/constants";
import { OBSERVABILITY_DEFAULT_INVOCATIONS_GROUP } from "@/pages/observability/constants";

import { useAlchemySearchUpdate, useObservabilitySearch } from "@/module/hooks";
import type { ObservabilitySearch } from "@/module/schemas";

import { mapOptionIdToEnum } from "@/utils/select";

const ObservabilityInvocationsGroupSelect: FC = () => {
  const { invocationsGroup } = useObservabilitySearch();
  const updateSearch = useAlchemySearchUpdate<ObservabilitySearch>();

  const handleChange = (id: string | null) => {
    const nextGroup =
      id === null ? MetricDimension.UNSPECIFIED : mapOptionIdToEnum(MetricDimension, id);
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
        value={invocationsGroup === MetricDimension.UNSPECIFIED ? null : String(invocationsGroup)}
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
