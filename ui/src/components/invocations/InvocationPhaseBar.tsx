import type { FC } from "react";

import { styled } from "@linaria/react";

import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Square, { SquareSize, SquareVariant } from "@galaxy-io/dls/shapes/Square";
import { HAIRLINE_WIDTH } from "@galaxy-io/dls/styles/mixins";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import { t } from "@galaxy-io/dls/theme/tokens/t";

import type { InvocationStats } from "@/gen/functions/v1/invocations_pb";

import {
  INVOCATION_PHASE_BAR_HEIGHT,
  INVOCATION_PHASE_BAR_SEGMENT_MIN_WIDTH,
  INVOCATION_PHASE_TO_HUE_MAP,
  INVOCATION_PHASE_TO_LABEL_MAP,
  INVOCATION_PHASES,
} from "@/components/invocations/constants";
import { InvocationPhase } from "@/components/invocations/types";

import { formatMicros } from "@/utils/format";

const PhaseTrack = styled.div`
  display: flex;
  width: 100%;
  height: ${INVOCATION_PHASE_BAR_HEIGHT}px;
  gap: ${HAIRLINE_WIDTH};
  border-radius: ${t.radius.sm};
  overflow: hidden;
  background-color: ${t.color.background.tertiary};
`;

const PhaseSegment = styled.div<{ $share: number; $color: string }>`
  flex: ${({ $share }) => $share} 1 0;
  min-width: ${INVOCATION_PHASE_BAR_SEGMENT_MIN_WIDTH}px;
  background-color: ${({ $color }) => $color};
`;

interface InvocationPhaseBarProps {
  stats: InvocationStats;
}

const InvocationPhaseBar: FC<InvocationPhaseBarProps> = ({ stats }) => {
  const acquireUs = Number(stats.acquireUs);
  const runUs = Number(stats.runUs);
  const totalUs = Number(stats.totalUs);
  const phaseToUs: Record<InvocationPhase, number> = {
    [InvocationPhase.ACQUIRE]: acquireUs,
    [InvocationPhase.RUN]: runUs,
    [InvocationPhase.VALIDATE]: Math.max(0, totalUs - acquireUs - runUs),
  };

  return (
    <Flex direction={FlexDirection.COLUMN} gap={8} fillWidth>
      <PhaseTrack
        role="img"
        aria-label={`Acquire ${formatMicros(acquireUs)}, run ${formatMicros(runUs)}, total ${formatMicros(totalUs)}`}
      >
        {INVOCATION_PHASES.map((phase) => {
          const hue = INVOCATION_PHASE_TO_HUE_MAP[phase];
          return (
            <PhaseSegment
              key={phase}
              $share={Math.max(phaseToUs[phase], 1)}
              $color={hue ? t.color.mark[hue] : t.color.text.disabled}
            />
          );
        })}
      </PhaseTrack>
      <Flex justifyContent={JustifyContent.SPACE_BETWEEN} gap={12} fillWidth>
        {INVOCATION_PHASES.map((phase) => {
          const hue = INVOCATION_PHASE_TO_HUE_MAP[phase];
          return (
            <Flex key={phase} alignItems={AlignItems.CENTER} gap={8}>
              {hue ? (
                <Square size={SquareSize.X_SMALL} color={hue} />
              ) : (
                <Square size={SquareSize.X_SMALL} variant={SquareVariant.DISABLED} />
              )}
              <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
                {INVOCATION_PHASE_TO_LABEL_MAP[phase]}
              </Text>
              <Text size={TextSize.CAPTION} family={FontFamily.MONO} isTabular>
                {formatMicros(phaseToUs[phase])}
              </Text>
            </Flex>
          );
        })}
        <Flex alignItems={AlignItems.CENTER} gap={8}>
          <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
            Total
          </Text>
          <Text size={TextSize.CAPTION} family={FontFamily.MONO} isTabular>
            {formatMicros(totalUs)}
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default InvocationPhaseBar;
