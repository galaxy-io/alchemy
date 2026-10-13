import { useMemo } from "react";

import { create } from "@bufbuild/protobuf";

import InfiniteTable from "@galaxy-io/dls/table/InfiniteTable";
import CodeBlock, { CodeBlockLanguage } from "@galaxy-io/dls/text/CodeBlock";

import { GetFunctionRequestSchema } from "@/gen/functions/v1/functions_pb";

import { getFunctionCurrentVersion } from "@/pages/functions/utils";
import {
  FUNCTION_VERSIONS_BUILD_LOG_PLACEHOLDER,
  FUNCTION_VERSIONS_TABLE_COLUMN_ID_VERSION,
} from "@/pages/functions/versions/constants";
import FunctionVersionsTableRowActions from "@/pages/functions/versions/FunctionVersionsTableRowActions";
import type { FunctionVersionsTableRow } from "@/pages/functions/versions/types";
import { createFunctionVersionsTableColumns } from "@/pages/functions/versions/utils";

import { useSuspenseGetFunctionQuery } from "@/api/queries/functions";

import {
  useAlchemyNavigate,
  useAlchemySearchUpdate,
  useFunctionParams,
  useFunctionSearch,
} from "@/module/hooks";
import type { FunctionSearch } from "@/module/schemas";

const FunctionVersionsTable = () => {
  const updateSearch = useAlchemySearchUpdate<FunctionSearch>();
  const navigateAlchemy = useAlchemyNavigate();
  const { id } = useFunctionParams();
  const { version: expandedVersion } = useFunctionSearch();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const fn = data.function;

  const columns = useMemo(() => createFunctionVersionsTableColumns(), []);

  const rows: FunctionVersionsTableRow[] = (fn?.versions ?? []).map((version) => ({
    version,
    isCurrent: !!fn && getFunctionCurrentVersion(fn)?.id === version.id,
  }));

  const handleExpandedIdsChange = (ids: string[]) => {
    const lastId = ids[ids.length - 1];
    void updateSearch((prev) => ({ ...prev, version: lastId ? BigInt(lastId) : undefined }), {
      replace: true,
    });
  };

  const handleOpenInWorkbench = (row: FunctionVersionsTableRow) => {
    void navigateAlchemy({
      to: "./images/$id/workbench",
      params: { id },
      search: { version: row.version.version },
    });
  };

  return (
    <InfiniteTable<FunctionVersionsTableRow>
      ariaLabel="Versions"
      columns={columns}
      data={rows}
      getRowId={(row) => String(row.version.version)}
      defaultSort={{ columnId: FUNCTION_VERSIONS_TABLE_COLUMN_ID_VERSION, isDescending: true }}
      expandedIds={expandedVersion === undefined ? [] : [String(expandedVersion)]}
      onExpandedIdsChange={handleExpandedIdsChange}
      renderExpandedRow={(row) => (
        <CodeBlock
          language={CodeBlockLanguage.PLAIN}
          content={row.version.buildLog || FUNCTION_VERSIONS_BUILD_LOG_PLACEHOLDER}
        />
      )}
      rowActions={(row) => (
        <FunctionVersionsTableRowActions row={row} onOpenInWorkbench={handleOpenInWorkbench} />
      )}
    />
  );
};

export default FunctionVersionsTable;
