import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";

import type { FunctionVersion } from "@/gen/functions/v1/functions_pb";

import { formatFunctionVersion } from "@/pages/functions/utils";

interface FunctionVersionChipProps {
  version: FunctionVersion["version"] | undefined;
  size?: ChipSize;
}

const FunctionVersionChip = ({ version, size = ChipSize.SMALL }: FunctionVersionChipProps) => (
  <Chip
    label={version === undefined ? "No build" : formatFunctionVersion(version)}
    variant={version === undefined ? ChipVariant.WARNING : ChipVariant.TERTIARY}
    size={size}
  />
);

export default FunctionVersionChip;
