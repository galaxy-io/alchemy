import type { FC } from "react";

import { create } from "@bufbuild/protobuf";
import { notFound } from "@tanstack/react-router";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import InfiniteTable from "@galaxy-io/dls/table/InfiniteTable";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";

import { CreateFunctionVersionRequestSchema } from "@/gen/functions/v1/functions_pb";

import { getFunctionCurrentVersion } from "@/pages/functions/utils";
import { FUNCTION_VERSIONS_TABLE_COLUMNS } from "@/pages/functions/versions/constants";
import FunctionVersionsDetails from "@/pages/functions/versions/FunctionVersionsDetails";
import FunctionVersionsTableRowActions from "@/pages/functions/versions/FunctionVersionsTableRowActions";
import type { FunctionVersionsTableRow } from "@/pages/functions/versions/types";

import {
  useAlchemyNavigate,
  useAlchemySearchUpdate,
  useFunctionParams,
  useFunctionSearch,
} from "@/module/hooks";
import { AlchemyPath } from "@/module/paths";
import type { FunctionSearch } from "@/module/schemas";

import { useCreateFunctionVersionMutation } from "@/api/queries/function_versions";
import { createGetFunctionInput, useSuspenseGetFunctionQuery } from "@/api/queries/functions";

import { getErrorMessage } from "@/utils/errors";
import { formatVersion } from "@/utils/format";

const FunctionVersionsPage: FC = () => {
  const { id } = useFunctionParams();
  const navigate = useAlchemyNavigate();
  const updateSearch = useAlchemySearchUpdate<FunctionSearch>();
  const { version: expandedVersion } = useFunctionSearch();
  const { toast } = useToast();
  const { mutate: createVersion } = useCreateFunctionVersionMutation();

  const { data } = useSuspenseGetFunctionQuery({ input: createGetFunctionInput(id) });
  const alchemyFunction = data.function;

  if (!alchemyFunction) {
    throw notFound();
  }

  const currentId = getFunctionCurrentVersion(alchemyFunction)?.id;
  const rows: FunctionVersionsTableRow[] = alchemyFunction.versions.map((version) => ({
    version,
    isCurrent: version.id === currentId,
  }));

  const handleExpandedIdsChange = (ids: string[]) => {
    const lastId = ids[ids.length - 1];
    void updateSearch((prev) => ({ ...prev, version: lastId ? BigInt(lastId) : undefined }), {
      replace: true,
    });
  };

  const handleOpenWorkbench = (row: FunctionVersionsTableRow) => {
    void navigate({
      to: AlchemyPath.FUNCTION_WORKBENCH,
      params: { id },
      search: { version: row.version.version },
    });
  };

  const handleOpenContract = (row: FunctionVersionsTableRow) => {
    void navigate({
      to: AlchemyPath.FUNCTION_CONTRACT,
      params: { id },
      search: { version: row.version.version },
    });
  };

  const handleRetryBuild = (row: FunctionVersionsTableRow) => {
    createVersion(
      create(CreateFunctionVersionRequestSchema, { functionId: id, spec: row.version.spec }),
      {
        onSuccess: ({ version }) => {
          toast({
            header: `${formatVersion(version?.version)} building`,
            variant: ToastVariant.SUCCESS,
          });
          void updateSearch((prev) => ({ ...prev, version: version?.version }), { replace: true });
        },
        onError: (error) => {
          toast({
            header: "Build failed",
            description: getErrorMessage(error, "Failed to start build"),
            variant: ToastVariant.ERROR,
          });
        },
      },
    );
  };

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minHeight={0} fillWidth>
      <InfiniteTable<FunctionVersionsTableRow>
        ariaLabel="Versions"
        columns={FUNCTION_VERSIONS_TABLE_COLUMNS}
        data={rows}
        getRowId={(row) => String(row.version.version)}
        expandedIds={expandedVersion === undefined ? [] : [String(expandedVersion)]}
        onExpandedIdsChange={handleExpandedIdsChange}
        renderExpandedRow={(row) => <FunctionVersionsDetails version={row.version} />}
        rowActions={(row) => (
          <FunctionVersionsTableRowActions
            row={row}
            onOpenWorkbench={handleOpenWorkbench}
            onOpenContract={handleOpenContract}
            onRetryBuild={handleRetryBuild}
          />
        )}
      />
    </Flex>
  );
};

export default FunctionVersionsPage;
