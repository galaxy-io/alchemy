import { styled } from "@linaria/react";

import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import { t } from "@galaxy-io/dls/theme/tokens/t";

import type { InvocationStats } from "@/gen/functions/v1/invocations_pb";

import { formatMicros } from "@/utils/format";

const INVOCATION_PHASE_BAR_HEIGHT = 6;
const INVOCATION_PHASE_BAR_SEGMENT_MIN_WIDTH = 2;
const INVOCATION_PHASE_BAR_SWATCH_SIZE = 8;

const PhaseTrack = styled.div`
  display: flex;
  width: 100%;
  height: ${INVOCATION_PHASE_BAR_HEIGHT}px;
  gap: 1px;
  border-radius: ${t.radius.sm};
  overflow: hidden;
  background-color: ${t.color.background.tertiary};
`;

const PhaseSegment = styled.div<{ $share: number; $hue: string }>`
  flex: ${({ $share }) => $share} 1 0;
  min-width: ${INVOCATION_PHASE_BAR_SEGMENT_MIN_WIDTH}px;
  background-color: ${({ $hue }) => $hue};
`;

const PhaseSwatch = styled.span<{ $hue: string }>`
  display: inline-block;
  width: ${INVOCATION_PHASE_BAR_SWATCH_SIZE}px;
  height: ${INVOCATION_PHASE_BAR_SWATCH_SIZE}px;
  border-radius: ${t.radius.sm};
  background-color: ${({ $hue }) => $hue};
`;

interface InvocationPhaseBarProps {
  stats: InvocationStats;
}

const InvocationPhaseBar = ({ stats }: InvocationPhaseBarProps) => {
  const acquireUs = Number(stats.acquireUs);
  const runUs = Number(stats.runUs);
  const totalUs = Number(stats.totalUs);
  const phases = [
    { label: "Acquire", us: acquireUs, hue: t.color.mark.orange },
    { label: "Run", us: runUs, hue: t.color.mark.teal },
    { label: "Validate", us: Math.max(0, totalUs - acquireUs - runUs), hue: t.color.text.disabled },
  ];

  return (
    <Flex direction={FlexDirection.COLUMN} gap={8} fillWidth>
      <PhaseTrack
        role="img"
        aria-label={`Acquire ${formatMicros(acquireUs)}, run ${formatMicros(runUs)}, total ${formatMicros(totalUs)}`}
      >
        {phases.map((phase) => (
          <PhaseSegment key={phase.label} $share={Math.max(phase.us, 1)} $hue={phase.hue} />
        ))}
      </PhaseTrack>
      <Flex justifyContent={JustifyContent.SPACE_BETWEEN} gap={12} fillWidth>
        {phases.map((phase) => (
          <Flex key={phase.label} alignItems={AlignItems.CENTER} gap={8}>
            <PhaseSwatch $hue={phase.hue} />
            <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
              {phase.label}
            </Text>
            <Text size={TextSize.CAPTION} family={FontFamily.MONO} isTabular>
              {formatMicros(phase.us)}
            </Text>
          </Flex>
        ))}
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
