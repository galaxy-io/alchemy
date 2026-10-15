import { type FC, type RefObject, useMemo } from "react";

import { FloppyDiskIcon, MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react";

import Button, { ButtonSize } from "@galaxy-io/dls/buttons/Button";
import { useEndReached } from "@galaxy-io/dls/hooks/useEndReached";
import Box from "@galaxy-io/dls/layout/Box";
import EmptyLayout from "@galaxy-io/dls/layout/EmptyLayout";
import Grid from "@galaxy-io/dls/layout/Grid";
import PageLayout from "@galaxy-io/dls/layout/PageLayout";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";

import { FUNCTION_CREATE_TITLE } from "@/components/functions/constants";
import ListSearch from "@/components/ListSearch";

import { FUNCTION_CARD_GRID_MIN_WIDTH } from "@/pages/functions/components/card/constants";
import FunctionCard from "@/pages/functions/components/card/FunctionCard";
import { useFunctionCardMetrics } from "@/pages/functions/hooks/useFunctionCardMetrics";

import { useAlchemyFlowOpen, useFunctionsSearch } from "@/module/hooks";
import { Flow } from "@/module/types";

import {
  createListFunctionsInput,
  useSuspenseListFunctionsInfiniteQuery,
} from "@/api/queries/functions";

const FunctionsPage: FC = () => {
  const openFlow = useAlchemyFlowOpen();
  const search = useFunctionsSearch();
  const metricsById = useFunctionCardMetrics();

  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSuspenseListFunctionsInfiniteQuery({ input: createListFunctionsInput(search) });
  const functions = useMemo(() => data.pages.flatMap((page) => page.functions), [data.pages]);
  const endRef = useEndReached({
    onEndReached: hasNextPage ? () => void fetchNextPage() : undefined,
    isEnabled: !isFetchingNextPage,
    itemCount: functions.length,
  });

  const handleNewFunction = () => {
    openFlow(Flow.CREATE_FUNCTION);
  };

  const renderContent = () => {
    if (!functions.length && search.q) {
      return <EmptyLayout icon={MagnifyingGlassIcon} header="No images match your search" />;
    }
    if (!functions.length) {
      return (
        <EmptyLayout
          icon={FloppyDiskIcon}
          header="No images yet"
          description="An image plus a typed contract, built once and booted on demand"
          actions={
            <Button
              label={FUNCTION_CREATE_TITLE}
              icon={PlusIcon}
              size={ButtonSize.LARGE}
              onClick={handleNewFunction}
            />
          }
        />
      );
    }
    return (
      <ScrollArea>
        <Box padding={16}>
          <Grid
            columns={`repeat(auto-fill, minmax(${FUNCTION_CARD_GRID_MIN_WIDTH}px, 1fr))`}
            gap={12}
          >
            {functions.map((alchemyFunction) => (
              <FunctionCard
                key={alchemyFunction.id}
                alchemyFunction={alchemyFunction}
                metrics={metricsById.get(alchemyFunction.id)}
              />
            ))}
          </Grid>
          <div ref={endRef as RefObject<HTMLDivElement>} />
        </Box>
      </ScrollArea>
    );
  };

  return (
    <PageLayout
      header="Images"
      actions={<Button label={FUNCTION_CREATE_TITLE} icon={PlusIcon} onClick={handleNewFunction} />}
      toolbar={<ListSearch placeholder="Search images" />}
    >
      {renderContent()}
    </PageLayout>
  );
};

export default FunctionsPage;
