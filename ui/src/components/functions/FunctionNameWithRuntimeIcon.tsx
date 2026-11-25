import type { FC } from "react";

import Skeleton from "@galaxy-io/dls/feedback/Skeleton";
import Box from "@galaxy-io/dls/layout/Box";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import { FUNCTION_NAME_SKELETON_WIDTH } from "@/components/functions/constants";

import FunctionRuntimeIcon from "@/pages/functions/components/FunctionRuntimeIcon";
import { useFunctionRuntime } from "@/pages/functions/hooks/useFunctionRuntime";

import { createGetFunctionInput, useGetFunctionQuery } from "@/api/queries/functions";

interface FunctionNameWithRuntimeIconProps {
  functionId: AlchemyFunction["id"];
}

const FunctionNameWithRuntimeIcon: FC<FunctionNameWithRuntimeIconProps> = ({ functionId }) => {
  const { data, isLoading } = useGetFunctionQuery({
    input: createGetFunctionInput(functionId),
    options: { retry: false },
  });
  const alchemyFunction = data?.function;
  const runtime = useFunctionRuntime(alchemyFunction);

  if (isLoading) {
    return (
      <Box width={FUNCTION_NAME_SKELETON_WIDTH}>
        <Skeleton />
      </Box>
    );
  }

  return (
    <Flex alignItems={AlignItems.CENTER} gap={8} minWidth={0}>
      {runtime ? <FunctionRuntimeIcon runtime={runtime} /> : null}
      <Text size={TextSize.BODY_SM} lineClamp={1} shouldTooltipOnOverflow>
        {alchemyFunction?.name ?? functionId}
      </Text>
    </Flex>
  );
};

export default FunctionNameWithRuntimeIcon;
