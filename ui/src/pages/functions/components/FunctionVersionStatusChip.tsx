import type { FC } from "react";

import Chip, { ChipSize } from "@galaxy-io/dls/chips/Chip";
import Flasher from "@galaxy-io/dls/transform/Flasher";

import { FunctionVersionStatus } from "@/gen/functions/v1/functions_pb";

import {
  FUNCTION_VERSION_STATUS_TO_LABEL_MAP,
  FUNCTION_VERSION_STATUS_TO_TONE_MAP,
} from "@/pages/functions/constants";

interface FunctionVersionStatusChipProps {
  status: FunctionVersionStatus;
  message?: string;
}

const FunctionVersionStatusChip: FC<FunctionVersionStatusChipProps> = ({ status, message }) => (
  <Flasher isFlashing={status === FunctionVersionStatus.BUILDING}>
    <Chip
      label={FUNCTION_VERSION_STATUS_TO_LABEL_MAP[status]}
      {...FUNCTION_VERSION_STATUS_TO_TONE_MAP[status]}
      size={ChipSize.SMALL}
      hasDot
      tooltip={message || undefined}
    />
  </Flasher>
);

export default FunctionVersionStatusChip;
