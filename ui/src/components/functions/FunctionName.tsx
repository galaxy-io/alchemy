import type { FC } from "react";

import Skeleton from "@galaxy-io/dls/feedback/Skeleton";
import Box from "@galaxy-io/dls/layout/Box";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import { FUNCTION_NAME_SKELETON_WIDTH } from "@/components/functions/constants";

import { createGetFunctionInput, useGetFunctionQuery } from "@/api/queries/functions";

interface FunctionNameProps {
  functionId: AlchemyFunction["id"];
}

const FunctionName: FC<FunctionNameProps> = ({ functionId }) => {
  const { data, isLoading } = useGetFunctionQuery({
    input: createGetFunctionInput(functionId),
    options: { retry: false },
  });

  if (isLoading) {
    return (
      <Box width={FUNCTION_NAME_SKELETON_WIDTH}>
        <Skeleton />
      </Box>
    );
  }

  return (
    <Text size={TextSize.BODY_SM} lineClamp={1} shouldTooltipOnOverflow>
      {data?.function?.name ?? functionId}
    </Text>
  );
};

export default FunctionName;
