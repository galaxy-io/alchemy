import type { FC } from "react";

import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";

import type { FunctionVersion } from "@/gen/functions/v1/functions_pb";

import { formatVersion } from "@/utils/format";

interface FunctionVersionChipProps {
  version: FunctionVersion["version"] | undefined;
  size?: ChipSize;
}

const FunctionVersionChip: FC<FunctionVersionChipProps> = ({ version, size = ChipSize.SMALL }) =>
  version ? (
    <Chip label={formatVersion(version)} variant={ChipVariant.TERTIARY} size={size} />
  ) : (
    <Chip label="No build" variant={ChipVariant.WARNING} size={size} />
  );

export default FunctionVersionChip;
