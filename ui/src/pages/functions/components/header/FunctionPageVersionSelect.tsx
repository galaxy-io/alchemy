import type { FC } from "react";

import SelectInput, { SelectInputSize, type SelectOption } from "@galaxy-io/dls/inputs/SelectInput";
import Box from "@galaxy-io/dls/layout/Box";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import { getFunctionCurrentVersion } from "@/components/functions/utils";

import { FUNCTION_PAGE_VERSION_SELECT_WIDTH } from "@/pages/functions/components/header/constants";
import { useFunctionVersion } from "@/pages/functions/hooks/useFunctionVersion";

import { useAlchemySearchUpdate } from "@/module/hooks";
import type { FunctionSearch } from "@/module/schemas";

import { formatVersion } from "@/utils/format";

interface FunctionPageVersionSelectProps {
  alchemyFunction: AlchemyFunction;
}

const FunctionPageVersionSelect: FC<FunctionPageVersionSelectProps> = ({ alchemyFunction }) => {
  const updateSearch = useAlchemySearchUpdate<FunctionSearch>();
  const version = useFunctionVersion();

  if (!version) return null;

  const options: SelectOption[] = alchemyFunction.versions.map((candidate) => ({
    id: String(candidate.version),
    label: formatVersion(candidate.version),
  }));

  const handleChange = (value: string | null) => {
    if (value === null) return;
    const next = BigInt(value);
    const isCurrent = getFunctionCurrentVersion(alchemyFunction)?.version === next;
    void updateSearch((prev) => ({ ...prev, version: isCurrent ? undefined : next }), {
      replace: true,
    });
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
