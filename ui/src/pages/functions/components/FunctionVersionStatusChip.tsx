import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import Flasher from "@galaxy-io/dls/transform/Flasher";

import { FunctionVersionStatus } from "@/gen/functions/v1/functions_pb";

import {
  FUNCTION_VERSION_STATUS_TO_HUE_MAP,
  FUNCTION_VERSION_STATUS_TO_LABEL_MAP,
} from "@/pages/functions/constants";

interface FunctionVersionStatusChipProps {
  status: FunctionVersionStatus;
  message?: string;
  size?: ChipSize;
}

const FunctionVersionStatusChip = ({
  status,
  message,
  size = ChipSize.SMALL,
}: FunctionVersionStatusChipProps) => {
  const hue = FUNCTION_VERSION_STATUS_TO_HUE_MAP[status];
  const chip = (
    <Chip
      label={FUNCTION_VERSION_STATUS_TO_LABEL_MAP[status]}
      {...(hue === null ? { variant: ChipVariant.SECONDARY } : { color: hue })}
      size={size}
      hasDot
      {...(message ? { tooltip: message } : {})}
    />
  );

  return status === FunctionVersionStatus.BUILDING ? <Flasher isFlashing>{chip}</Flasher> : chip;
};

export default FunctionVersionStatusChip;
