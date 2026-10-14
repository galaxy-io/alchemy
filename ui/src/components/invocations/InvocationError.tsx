import type { FC } from "react";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import type { FunctionError } from "@/gen/functions/v1/invocations_pb";

interface InvocationErrorProps {
  error: FunctionError;
}

const InvocationError: FC<InvocationErrorProps> = ({ error }) => (
  <Flex direction={FlexDirection.COLUMN} gap={4}>
    <Text size={TextSize.BODY_SM} family={FontFamily.MONO} isSelectable>
      {error.type ? `${error.type}: ${error.message}` : error.message}
    </Text>
    {error.violations.map((violation) => (
      <Text
        key={`${violation.instancePath}:${violation.schemaPath}`}
        size={TextSize.CAPTION}
        family={FontFamily.MONO}
        isSelectable
      >
        {`${violation.instancePath || "/"} ${violation.message}`}
      </Text>
    ))}
  </Flex>
);

export default InvocationError;
