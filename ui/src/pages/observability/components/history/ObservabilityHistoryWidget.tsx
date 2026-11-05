import { type FC, useMemo } from "react";

import { css } from "@linaria/core";
import { ListIcon, ListMagnifyingGlassIcon } from "@phosphor-icons/react";

import EmptyLayout, { EmptyLayoutSize } from "@galaxy-io/dls/layout/EmptyLayout";
import Widget from "@galaxy-io/dls/widget/Widget";

import { INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP } from "@/components/invocations/constants";
import InvocationsTable from "@/components/invocations/table/InvocationsTable";
import { InvocationsTableVariant } from "@/components/invocations/table/types";

import { createHistoryWindowInput } from "@/pages/observability/components/history/utils";
import { OBSERVABILITY_REFRESH_INTERVAL_TO_MS_MAP } from "@/pages/observability/constants";
import { useObservabilityBucketStart } from "@/pages/observability/hooks/useObservabilityBucketStart";

import { useObservabilitySearch } from "@/module/hooks";

import { useListInvocationsInfiniteQuery } from "@/api/queries/invocations";

const OBSERVABILITY_HISTORY_WIDGET_CSS = css`
  flex: 1 1 0;
  min-height: 0;
  border-inline: none;
  border-bottom: none;
  border-radius: 0;
`;

const ObservabilityHistoryWidget: FC = () => {
  const { timeframe, invocationsBucket, invocationsStatus, refreshInterval } =
    useObservabilitySearch();
  const { granularity } = INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe];
  const bucketStartMs = useObservabilityBucketStart(granularity);

  const input = useMemo(
    () => ({
      statuses: invocationsStatus === undefined ? [] : [invocationsStatus],
      ...createHistoryWindowInput(timeframe, bucketStartMs, invocationsBucket),
    }),
    [timeframe, bucketStartMs, invocationsBucket, invocationsStatus],
  );

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useListInvocationsInfiniteQuery({
      input,
      refetchInterval: OBSERVABILITY_REFRESH_INTERVAL_TO_MS_MAP[refreshInterval],
    });

  return (
    <Widget
      className={OBSERVABILITY_HISTORY_WIDGET_CSS}
      header="History"
      icon={ListIcon}
      isFlush
      gap={0}
    >
      <InvocationsTable
        invocations={data?.pages.flatMap((page) => page.invocations) ?? []}
        isLoading={isLoading || isFetchingNextPage}
        variant={InvocationsTableVariant.COMPACT}
        onEndReached={() => {
          if (hasNextPage) void fetchNextPage();
        }}
        emptyState={
          <EmptyLayout
            size={EmptyLayoutSize.SMALL}
            icon={ListMagnifyingGlassIcon}
            header="No invocations in the selected timeframe"
          />
        }
      />
    </Widget>
  );
};

export default ObservabilityHistoryWidget;
