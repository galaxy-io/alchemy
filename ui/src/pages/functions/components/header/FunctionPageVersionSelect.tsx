import { create } from "@bufbuild/protobuf";

import SelectInput, { SelectInputSize, type SelectOption } from "@galaxy-io/dls/inputs/SelectInput";
import Box from "@galaxy-io/dls/layout/Box";

import { GetFunctionRequestSchema } from "@/gen/functions/v1/functions_pb";

import { FUNCTION_PAGE_VERSION_SELECT_WIDTH } from "@/pages/functions/components/header/constants";
import { useFunctionVersion } from "@/pages/functions/hooks/useFunctionVersion";
import { formatFunctionVersion } from "@/pages/functions/utils";

import { useSuspenseGetFunctionQuery } from "@/api/queries/functions";

import { useAlchemySearchUpdate, useFunctionParams } from "@/module/hooks";
import type { FunctionSearch } from "@/module/schemas";

const FunctionPageVersionSelect = () => {
  const updateSearch = useAlchemySearchUpdate<FunctionSearch>();
  const { id } = useFunctionParams();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const version = useFunctionVersion();

  if (!version) return null;

  const options: SelectOption[] = (data.function?.versions ?? []).map((candidate) => ({
    id: String(candidate.version),
    label: formatFunctionVersion(candidate.version),
  }));

  const handleChange = (value: string | null) => {
    if (value === null) return;
    void updateSearch((prev) => ({ ...prev, version: BigInt(value) }), { replace: true });
  };

  return (
    <Box width={FUNCTION_PAGE_VERSION_SELECT_WIDTH}>
      <SelectInput
        ariaLabel="Version"
        size={SelectInputSize.SMALL}
        options={options}
        value={String(version.version)}
        onChange={handleChange}
        fillWidth
      />
    </Box>
  );
};

export default FunctionPageVersionSelect;
