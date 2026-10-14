import type { FC } from "react";

import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import Square, { SquareSize } from "@galaxy-io/dls/shapes/Square";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import Tooltip from "@galaxy-io/dls/tooltip/Tooltip";
import { EMPTY_VALUE } from "@galaxy-io/dls/utils/format";

import type { StartKind } from "@/gen/functions/v1/invocations_pb";

import {
  START_KIND_TO_DESCRIPTION_MAP,
  START_KIND_TO_HUE_MAP,
  START_KIND_TO_LABEL_MAP,
} from "@/components/invocations/constants";

interface InvocationStartKindProps {
  startKind: StartKind;
}

const InvocationStartKind: FC<InvocationStartKindProps> = ({ startKind }) => {
  const hue = START_KIND_TO_HUE_MAP[startKind];

  if (!hue) {
    return (
      <Text size={TextSize.BODY_SM} variant={TextVariant.TERTIARY}>
        {EMPTY_VALUE}
      </Text>
    );
  }

  return (
    <Tooltip body={START_KIND_TO_DESCRIPTION_MAP[startKind]}>
      <Flex alignItems={AlignItems.CENTER} gap={8}>
        <Square color={hue} size={SquareSize.SMALL} />
        <Text size={TextSize.BODY_SM} lineClamp={1}>
          {START_KIND_TO_LABEL_MAP[startKind]}
        </Text>
      </Flex>
    </Tooltip>
  );
};

export default InvocationStartKind;
