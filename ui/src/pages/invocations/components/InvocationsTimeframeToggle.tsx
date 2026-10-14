import ToggleInput, { type ToggleOption } from "@galaxy-io/dls/inputs/ToggleInput";

import { INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP } from "@/pages/invocations/constants";
import { InvocationsTimeframe } from "@/pages/invocations/types";

const INVOCATIONS_TIMEFRAME_OPTIONS: ToggleOption<InvocationsTimeframe>[] = Object.values(
  InvocationsTimeframe,
).map((timeframe) => ({
  id: timeframe,
  label: INVOCATIONS_TIMEFRAME_TO_CONFIG_MAP[timeframe].label,
}));

interface InvocationsTimeframeToggleProps {
  value: InvocationsTimeframe;
  onChange: (timeframe: InvocationsTimeframe) => void;
}

const InvocationsTimeframeToggle = ({ value, onChange }: InvocationsTimeframeToggleProps) => (
  <ToggleInput
    ariaLabel="Timeframe"
    options={INVOCATIONS_TIMEFRAME_OPTIONS}
    value={value}
    onChange={onChange}
  />
);

export default InvocationsTimeframeToggle;
