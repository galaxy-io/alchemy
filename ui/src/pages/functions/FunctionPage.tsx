import type { FC } from "react";

import { notFound, Outlet } from "@tanstack/react-router";

import PageLayout from "@galaxy-io/dls/layout/PageLayout";

import FunctionPageActions from "@/pages/functions/components/header/FunctionPageActions";
import FunctionPageBanner from "@/pages/functions/components/header/FunctionPageBanner";
import FunctionPageHeading from "@/pages/functions/components/header/FunctionPageHeading";
import FunctionPageTabs from "@/pages/functions/components/header/FunctionPageTabs";

import { useFunctionParams } from "@/module/hooks";

import { createGetFunctionInput, useSuspenseGetFunctionQuery } from "@/api/queries/functions";

const FunctionPage: FC = () => {
  const { id } = useFunctionParams();

  const { data } = useSuspenseGetFunctionQuery({ input: createGetFunctionInput(id) });
  const alchemyFunction = data.function;

  if (!alchemyFunction) {
    throw notFound();
  }

  return (
    <PageLayout
      header={<FunctionPageHeading alchemyFunction={alchemyFunction} />}
      actions={<FunctionPageActions alchemyFunction={alchemyFunction} />}
      tabs={<FunctionPageTabs />}
      banner={<FunctionPageBanner alchemyFunction={alchemyFunction} />}
    >
      <Outlet />
    </PageLayout>
  );
};

export default FunctionPage;
