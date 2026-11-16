import type { FC } from "react";

import ToggleInput, { type ToggleOption } from "@galaxy-io/dls/inputs/ToggleInput";

import { Network } from "@/gen/functions/v1/common_pb";

import { FUNCTION_NETWORK_TO_LABEL_MAP, FUNCTION_NETWORKS } from "@/pages/functions/constants";

const FUNCTION_NETWORK_OPTIONS: ToggleOption[] = FUNCTION_NETWORKS.map((network) => ({
  id: Network[network],
  label: FUNCTION_NETWORK_TO_LABEL_MAP[network],
}));

interface FunctionNetworkToggleProps {
  network: Network;
  onChange: (network: Network) => void;
}

const FunctionNetworkToggle: FC<FunctionNetworkToggleProps> = ({ network, onChange }) => (
  <ToggleInput
    label="Outbound access"
    labelTooltip="Internet only, never private or cluster addresses"
    options={FUNCTION_NETWORK_OPTIONS}
    value={Network[network || Network.NONE]}
    onChange={(id) => onChange(Network[id as keyof typeof Network])}
  />
);

export default FunctionNetworkToggle;
