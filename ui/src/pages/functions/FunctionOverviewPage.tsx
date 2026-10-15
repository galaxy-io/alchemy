import { type FC, useMemo } from "react";

import { ListMagnifyingGlassIcon } from "@phosphor-icons/react";

import Divider from "@galaxy-io/dls/layout/Divider";
import EmptyLayout from "@galaxy-io/dls/layout/EmptyLayout";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import InvocationsTable from "@/components/invocations/table/InvocationsTable";
import { InvocationsTableVariant } from "@/components/invocations/table/types";

import FunctionOverviewMetrics from "@/pages/functions/overview/FunctionOverviewMetrics";

import { useFunctionParams } from "@/module/hooks";

import {
  createListInvocationsInput,
  useSuspenseListInvocationsInfiniteQuery,
} from "@/api/queries/invocations";

const FunctionOverviewPage: FC = () => {
  const { id } = useFunctionParams();

  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSuspenseListInvocationsInfiniteQuery({
      input: createListInvocationsInput({ functionId: id }),
    });
  const invocations = useMemo(() => data.pages.flatMap((page) => page.invocations), [data.pages]);

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minHeight={0} fillWidth>
      <Flex padding={16} shrink={0}>
        <FunctionOverviewMetrics functionId={id} />
      </Flex>
      <Divider />
      <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minHeight={0}>
        <InvocationsTable
          invocations={invocations}
          variant={InvocationsTableVariant.FUNCTION_SCOPED}
          isLoading={isFetchingNextPage}
          onEndReached={() => {
            if (hasNextPage) fetchNextPage();
          }}
          emptyState={<EmptyLayout icon={ListMagnifyingGlassIcon} header="No invocations yet" />}
        />
      </Flex>
    </Flex>
  );
};

export default FunctionOverviewPage;
