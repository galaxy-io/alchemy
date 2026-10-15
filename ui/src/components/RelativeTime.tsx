import type { FC } from "react";

import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import Tooltip from "@galaxy-io/dls/tooltip/Tooltip";
import { EMPTY_VALUE, formatRelativeTime } from "@galaxy-io/dls/utils/format";

import { formatTimestamp } from "@/utils/format";

interface RelativeTimeProps {
  unixMillis: bigint;
}

const RelativeTime: FC<RelativeTimeProps> = ({ unixMillis }) => {
  if (!unixMillis) {
    return (
      <Text size={TextSize.BODY_SM} variant={TextVariant.TERTIARY}>
        {EMPTY_VALUE}
      </Text>
    );
  }

  return (
    <Tooltip body={formatTimestamp(unixMillis)}>
      <Text size={TextSize.BODY_SM} lineClamp={1}>
        {formatRelativeTime(unixMillis)}
      </Text>
    </Tooltip>
  );
};

export default RelativeTime;
