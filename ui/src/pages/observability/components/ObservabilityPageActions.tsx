import type { FC } from "react";

import { ArrowsClockwiseIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";

import { INVOCATIONS_DEFAULT_TIMEFRAME } from "@/components/invocations/constants";
import InvocationsTimeframeToggle from "@/components/invocations/InvocationsTimeframeToggle";
import type { InvocationsTimeframe } from "@/components/invocations/types";

import { useAlchemySearchUpdate, useObservabilitySearch } from "@/module/hooks";
import type { ObservabilitySearch } from "@/module/schemas";

import { useRefreshObservabilityQueries } from "@/api/queries/metrics";

const ObservabilityPageActions: FC = () => {
  const updateSearch = useAlchemySearchUpdate<ObservabilitySearch>();
  const refresh = useRefreshObservabilityQueries();
  const { timeframe } = useObservabilitySearch();

  const handleTimeframeChange = (next: InvocationsTimeframe) => {
    void updateSearch(
      (prev) => ({
        ...prev,
        timeframe: next === INVOCATIONS_DEFAULT_TIMEFRAME ? undefined : next,
        invocationsBucket: undefined,
      }),
      { replace: true },
    );
  };

  return (
    <>
      <InvocationsTimeframeToggle value={timeframe} onChange={handleTimeframeChange} />
      <Button
        icon={ArrowsClockwiseIcon}
        variant={ButtonVariant.SECONDARY}
        ariaLabel="Refresh"
        tooltip="Refresh"
        onClick={refresh}
      />
    </>
  );
};

export default ObservabilityPageActions;
