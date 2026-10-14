import { create } from "@bufbuild/protobuf";
import { notFound, Outlet } from "@tanstack/react-router";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import { GetFunctionRequestSchema } from "@/gen/functions/v1/functions_pb";

import PageLayout from "@/layouts/page/PageLayout";

import FunctionPageActions from "@/pages/functions/components/header/FunctionPageActions";
import FunctionPageBanner from "@/pages/functions/components/header/FunctionPageBanner";
import FunctionPageHeading from "@/pages/functions/components/header/FunctionPageHeading";
import FunctionPageTabs from "@/pages/functions/components/header/FunctionPageTabs";

import { useSuspenseGetFunctionQuery } from "@/api/queries/functions";

import { useFunctionParams } from "@/module/hooks";

const FunctionPage = () => {
  const { id } = useFunctionParams();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const fn = data.function;

  if (!fn) {
    throw notFound();
  }

  return (
    <PageLayout
      title={fn.name}
      banner={<FunctionPageBanner />}
      heading={<FunctionPageHeading />}
      actions={<FunctionPageActions />}
      tabs={<FunctionPageTabs />}
    >
      <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
        <Outlet />
      </Flex>
    </PageLayout>
  );
};

export default FunctionPage;
