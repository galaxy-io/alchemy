import { useMemo } from "react";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import InfiniteTable from "@galaxy-io/dls/table/InfiniteTable";
import type { TableColumn } from "@galaxy-io/dls/table/types";
import Text, { TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { ArrowContract } from "@/gen/functions/v1/common_pb";

import {
  FUNCTION_CONTRACT_FIELDS_TABLE_COLUMN_MIN_WIDTH_NAME,
  FUNCTION_CONTRACT_FIELDS_TABLE_COLUMN_MIN_WIDTH_TYPE,
  FUNCTION_CONTRACT_FIELDS_TABLE_COLUMN_WIDTH_NULLABLE,
} from "@/pages/functions/contract/constants";
import type { FunctionArrowField } from "@/pages/functions/types";
import { decodeFunctionArrowFields } from "@/pages/functions/utils";

const FUNCTION_CONTRACT_FIELDS_TABLE_COLUMNS: TableColumn<FunctionArrowField>[] = [
  {
    id: "name",
    header: "Field",
    accessor: (row) => row.name,
    isRowHeader: true,
    minWidth: FUNCTION_CONTRACT_FIELDS_TABLE_COLUMN_MIN_WIDTH_NAME,
    cell: ({ value }) => <Text family={FontFamily.MONO}>{value}</Text>,
  } satisfies TableColumn<FunctionArrowField, string>,
  {
    id: "type",
    header: "Type",
    accessor: (row) => row.type,
    minWidth: FUNCTION_CONTRACT_FIELDS_TABLE_COLUMN_MIN_WIDTH_TYPE,
    cell: ({ value }) => (
      <Text family={FontFamily.MONO} variant={TextVariant.SECONDARY}>
        {value}
      </Text>
    ),
  } satisfies TableColumn<FunctionArrowField, string>,
  {
    id: "nullable",
    header: "Nullable",
    accessor: (row) => (row.nullable ? "yes" : "no"),
    width: FUNCTION_CONTRACT_FIELDS_TABLE_COLUMN_WIDTH_NULLABLE,
    cell: ({ value }) => <Text variant={TextVariant.SECONDARY}>{value}</Text>,
  } satisfies TableColumn<FunctionArrowField, string>,
];

interface FunctionContractFieldsProps {
  schema: ArrowContract["inputSchema"];
}

const FunctionContractFields = ({ schema }: FunctionContractFieldsProps) => {
  const fields = useMemo(() => decodeFunctionArrowFields(schema), [schema]);

  return (
    <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
      <InfiniteTable<FunctionArrowField>
        ariaLabel="Schema fields"
        columns={FUNCTION_CONTRACT_FIELDS_TABLE_COLUMNS}
        data={fields}
        getRowId={(row) => row.name}
      />
    </Flex>
  );
};

export default FunctionContractFields;
