import Spinner, { SpinnerSize } from "@galaxy-io/dls/feedback/Spinner";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Text, { TextVariant } from "@galaxy-io/dls/text/Text";

import { LAYOUT_SIZE_TO_GAP_MAP, LAYOUT_SIZE_TO_MESSAGE_SIZE_MAP } from "@/layouts/constants";
import { LayoutSize } from "@/layouts/types";

const PENDING_LAYOUT_SIZE_TO_SPINNER_SIZE_MAP: Record<LayoutSize, SpinnerSize> = {
  [LayoutSize.SMALL]: SpinnerSize.SMALL,
  [LayoutSize.MEDIUM]: SpinnerSize.MEDIUM,
  [LayoutSize.LARGE]: SpinnerSize.LARGE,
};

interface PendingLayoutProps {
  size?: LayoutSize;
  message?: string;
}

const PendingLayout = ({ size = LayoutSize.MEDIUM, message }: PendingLayoutProps) => {
  return (
    <Flex
      fillWidth
      height="100%"
      direction={FlexDirection.COLUMN}
      alignItems={AlignItems.CENTER}
      justifyContent={JustifyContent.CENTER}
      gap={LAYOUT_SIZE_TO_GAP_MAP[size]}
    >
      <Spinner
        size={PENDING_LAYOUT_SIZE_TO_SPINNER_SIZE_MAP[size]}
        ariaLabel={message ?? "Loading"}
      />
      {message && (
        <Text size={LAYOUT_SIZE_TO_MESSAGE_SIZE_MAP[size]} variant={TextVariant.SECONDARY}>
          {message}
        </Text>
      )}
    </Flex>
  );
};

export default PendingLayout;
