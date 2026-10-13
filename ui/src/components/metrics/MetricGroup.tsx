import type { ReactNode } from "react";

import BigNumber from "@galaxy-io/dls/charts/BigNumber";
import BigNumberGroup, { BigNumberGroupVariant } from "@galaxy-io/dls/charts/BigNumberGroup";

export interface MetricGroupTile {
  label: string;
  value: string;
  mark?: ReactNode;
}

interface MetricGroupProps {
  primary: MetricGroupTile;
  tiles: MetricGroupTile[];
}

const MetricGroup = ({ primary, tiles }: MetricGroupProps) => (
  <BigNumberGroup
    ariaLabel="Metrics"
    variant={BigNumberGroupVariant.PRIMARY}
    hasBorder
    fillWidth
    primary={
      <BigNumber
        label={primary.label}
        value={primary.value}
        {...(primary.mark ? { suffix: primary.mark } : {})}
      />
    }
  >
    {tiles.map((tile) => (
      <BigNumber
        key={tile.label}
        label={tile.label}
        value={tile.value}
        {...(tile.mark ? { suffix: tile.mark } : {})}
      />
    ))}
  </BigNumberGroup>
);

export default MetricGroup;
