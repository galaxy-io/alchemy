import { ChipSize } from "@galaxy-io/dls/chips/Chip";
import Box from "@galaxy-io/dls/layout/Box";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import Widget from "@galaxy-io/dls/widget/Widget";

import { FunctionVersionStatus } from "@/gen/functions/v1/functions_pb";

import { FUNCTION_CARD_DESCRIPTION_HEIGHT } from "@/pages/functions/components/card/constants";
import FunctionCardRecentInvocations from "@/pages/functions/components/card/FunctionCardRecentInvocations";
import FunctionCardStat from "@/pages/functions/components/card/FunctionCardStat";
import type { FunctionCardRow } from "@/pages/functions/components/card/types";
import FunctionVersionChip from "@/pages/functions/components/FunctionVersionChip";
import FunctionVersionStatusChip from "@/pages/functions/components/FunctionVersionStatusChip";
import { formatFunctionVersion, getFunctionCurrentVersion } from "@/pages/functions/utils";

import { useAlchemyNavigate } from "@/module/hooks";
import { formatCount, formatMicros, formatPercent } from "@/utils/format";

interface FunctionCardProps {
  row: FunctionCardRow;
}

const FunctionCard = ({ row }: FunctionCardProps) => {
  const navigate = useAlchemyNavigate();
  const newestVersion = row.fn.versions[0];

  const handleOpen = () => {
    void navigate({ to: "./images/$id", params: { id: row.fn.id } });
  };

  return (
    <Widget
      header={row.fn.name}
      isInteractive
      onClick={handleOpen}
      actions={
        <Flex gap={4} alignItems={AlignItems.CENTER}>
          {newestVersion && newestVersion.status !== FunctionVersionStatus.READY && (
            <FunctionVersionStatusChip
              status={newestVersion.status}
              message={`${formatFunctionVersion(newestVersion.version)} · ${newestVersion.statusMessage}`}
              size={ChipSize.X_SMALL}
            />
          )}
          <FunctionVersionChip
            version={getFunctionCurrentVersion(row.fn)?.version}
            size={ChipSize.X_SMALL}
          />
        </Flex>
      }
      footer={<FunctionCardRecentInvocations invocations={row.recentInvocations} />}
    >
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        <Box minHeight={FUNCTION_CARD_DESCRIPTION_HEIGHT}>
          <Text size={TextSize.BODY_SM} variant={TextVariant.SECONDARY} lineClamp={2}>
            {row.fn.description}
          </Text>
        </Box>
        <Flex alignItems={AlignItems.END} gap={24}>
          <FunctionCardStat label="Invocations · 24h" value={formatCount(row.count24h)} />
          <FunctionCardStat label="Success" value={formatPercent(row.successRate, 1)} />
          <FunctionCardStat label="p50" value={formatMicros(row.p50Us)} />
        </Flex>
      </Flex>
    </Widget>
  );
};

export default FunctionCard;
