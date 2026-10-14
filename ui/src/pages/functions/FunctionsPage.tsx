import { useMemo } from "react";

import { create } from "@bufbuild/protobuf";
import { FloppyDiskIcon, MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react";

import Button, { ButtonSize } from "@galaxy-io/dls/buttons/Button";
import SearchInput from "@galaxy-io/dls/inputs/SearchInput";
import Flex from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";

import { ListFunctionsRequestSchema } from "@/gen/functions/v1/functions_pb";

import EmptyLayout from "@/layouts/EmptyLayout";
import PageLayout from "@/layouts/page/PageLayout";

import { FUNCTION_CARD_GRID_MIN_WIDTH } from "@/pages/functions/components/card/constants";
import FunctionCard from "@/pages/functions/components/card/FunctionCard";
import { createFunctionCardRows } from "@/pages/functions/components/card/utils";

import { useSuspenseListFunctionsQuery } from "@/api/queries/functions";
import { useSuspenseListInvocationsQuery } from "@/api/queries/invocations";
import { createListSearchInput } from "@/api/utils";

import { useAlchemySearchUpdate, useFunctionsSearch } from "@/module/hooks";
import type { AlchemyLayoutSearch, FunctionsSearch } from "@/module/schemas";
import { Flow } from "@/module/types";

const FunctionsPage = () => {
  const updateSearch = useAlchemySearchUpdate<FunctionsSearch & AlchemyLayoutSearch>();
  const search = useFunctionsSearch();
  const { q = "" } = search;

  const { data: functionsData } = useSuspenseListFunctionsQuery({
    input: create(ListFunctionsRequestSchema, createListSearchInput(search)),
  });
  const { data: invocationsData } = useSuspenseListInvocationsQuery();

  const rows = useMemo(
    () => createFunctionCardRows(functionsData.functions, invocationsData.invocations),
    [functionsData.functions, invocationsData.invocations],
  );

  const handleSearch = (term: string) => {
    if (term === q) return;
    void updateSearch((prev) => ({ ...prev, q: term || undefined }), { replace: true });
  };

  const handleNewFunction = () => {
    void updateSearch((prev) => ({ ...prev, flow: Flow.CREATE_FUNCTION }));
  };

  const renderContent = () => {
    if (!rows.length && q) {
      return <EmptyLayout icon={MagnifyingGlassIcon} header="No images match your search" />;
    }
    if (!rows.length) {
      return (
        <EmptyLayout
          icon={FloppyDiskIcon}
          header="No images yet"
          description="An image plus a typed contract, built once and booted on demand."
          actions={
            <Button
              label="New image"
              icon={PlusIcon}
              size={ButtonSize.LARGE}
              onClick={handleNewFunction}
            />
          }
        />
      );
    }
    return (
      <Grid
        columns={`repeat(auto-fill, minmax(${FUNCTION_CARD_GRID_MIN_WIDTH}px, 1fr))`}
        gap={12}
        padding={16}
      >
        {rows.map((row) => (
          <FunctionCard key={row.fn.id} row={row} />
        ))}
      </Grid>
    );
  };

  return (
    <PageLayout
      title="Images"
      actions={<Button label="New image" icon={PlusIcon} onClick={handleNewFunction} />}
      toolbar={
        <Flex grow={1} minWidth={0}>
          <SearchInput
            ariaLabel="Search functions"
            placeholder="Search"
            defaultValue={q}
            onSearch={handleSearch}
            fillWidth
          />
        </Flex>
      }
    >
      {renderContent()}
    </PageLayout>
  );
};

export default FunctionsPage;
