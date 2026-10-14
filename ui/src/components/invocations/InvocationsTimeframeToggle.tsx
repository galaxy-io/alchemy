import type { FC } from "react";

import ToggleInput, { type ToggleOption } from "@galaxy-io/dls/inputs/ToggleInput";

import {
  INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP,
  INVOCATIONS_TIMEFRAMES,
} from "@/components/invocations/constants";
import type { InvocationsTimeframe } from "@/components/invocations/types";

const INVOCATIONS_TIMEFRAME_OPTIONS: ToggleOption<InvocationsTimeframe>[] =
  INVOCATIONS_TIMEFRAMES.map((timeframe) => ({
    id: timeframe,
    label: INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe].label,
  }));

interface InvocationsTimeframeToggleProps {
  value: InvocationsTimeframe;
  onChange: (timeframe: InvocationsTimeframe) => void;
}

const InvocationsTimeframeToggle: FC<InvocationsTimeframeToggleProps> = ({ value, onChange }) => (
  <ToggleInput
    ariaLabel="Timeframe"
    options={INVOCATIONS_TIMEFRAME_OPTIONS}
    value={value}
    onChange={onChange}
  />
);

export default InvocationsTimeframeToggle;
