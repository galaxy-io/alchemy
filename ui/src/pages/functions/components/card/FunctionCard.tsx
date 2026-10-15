import type { FC } from "react";

import { FloppyDiskIcon } from "@phosphor-icons/react";

import { ChipSize } from "@galaxy-io/dls/chips/Chip";
import Box from "@galaxy-io/dls/layout/Box";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import Widget from "@galaxy-io/dls/widget/Widget";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import Stat from "@/components/Stat";

import { FUNCTION_CARD_DESCRIPTION_HEIGHT } from "@/pages/functions/components/card/constants";
import FunctionCardRecentInvocations from "@/pages/functions/components/card/FunctionCardRecentInvocations";
import type { FunctionCardMetrics } from "@/pages/functions/components/card/types";
import FunctionVersionChip from "@/pages/functions/components/FunctionVersionChip";
import { getFunctionCurrentVersion } from "@/pages/functions/utils";

import { useAlchemyNavigate } from "@/module/hooks";
import { AlchemyPath } from "@/module/paths";

import { formatCount, formatMillis, formatRatio } from "@/utils/format";

interface FunctionCardProps {
  alchemyFunction: AlchemyFunction;
  metrics: FunctionCardMetrics | undefined;
}

const FunctionCard: FC<FunctionCardProps> = ({ alchemyFunction, metrics }) => {
  const navigate = useAlchemyNavigate();

  const handleOpen = () => {
    void navigate({ to: AlchemyPath.FUNCTION, params: { id: alchemyFunction.id } });
  };

  return (
    <Widget
      header={alchemyFunction.name}
      icon={FloppyDiskIcon}
      isInteractive
      onClick={handleOpen}
      actions={
        <FunctionVersionChip
          version={getFunctionCurrentVersion(alchemyFunction)?.version}
          size={ChipSize.X_SMALL}
        />
      }
      footer={<FunctionCardRecentInvocations functionId={alchemyFunction.id} />}
    >
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        <Box minHeight={FUNCTION_CARD_DESCRIPTION_HEIGHT}>
          <Text size={TextSize.BODY_SM} variant={TextVariant.SECONDARY} lineClamp={2}>
            {alchemyFunction.description}
          </Text>
        </Box>
        <Flex alignItems={AlignItems.END} gap={24}>
          <Stat label="Last 24 hours" value={formatCount(metrics?.count ?? 0)} />
          <Stat label="Success" value={formatRatio(metrics?.successRatio)} />
          <Stat label="Avg" value={formatMillis(metrics?.meanDurationMs)} />
        </Flex>
      </Flex>
    </Widget>
  );
};

export default FunctionCard;
