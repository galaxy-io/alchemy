import type { FC } from "react";

import { notFound } from "@tanstack/react-router";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";

import { FUNCTION_SETTINGS_PAGE_MAX_WIDTH } from "@/pages/functions/settings/constants";
import FunctionSettingsPageDanger from "@/pages/functions/settings/FunctionSettingsPageDanger";
import FunctionSettingsPageGeneral from "@/pages/functions/settings/FunctionSettingsPageGeneral";
import FunctionSettingsPageRuntime from "@/pages/functions/settings/FunctionSettingsPageRuntime";

import { useFunctionParams } from "@/module/hooks";

import { createGetFunctionInput, useSuspenseGetFunctionQuery } from "@/api/queries/functions";

const FunctionSettingsPage: FC = () => {
  const { id } = useFunctionParams();

  const { data } = useSuspenseGetFunctionQuery({ input: createGetFunctionInput(id) });
  const alchemyFunction = data.function;

  if (!alchemyFunction) {
    throw notFound();
  }

  return (
    <ScrollArea>
      <Flex
        direction={FlexDirection.COLUMN}
        gap={12}
        padding={16}
        maxWidth={FUNCTION_SETTINGS_PAGE_MAX_WIDTH}
      >
        <FunctionSettingsPageGeneral
          key={`${alchemyFunction.name}:${alchemyFunction.description}`}
          alchemyFunction={alchemyFunction}
        />
        <FunctionSettingsPageRuntime />
        <FunctionSettingsPageDanger alchemyFunction={alchemyFunction} />
      </Flex>
    </ScrollArea>
  );
};

export default FunctionSettingsPage;
