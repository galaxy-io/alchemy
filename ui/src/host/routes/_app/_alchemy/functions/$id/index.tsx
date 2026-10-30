import { createFileRoute } from "@tanstack/react-router";

import FunctionOverviewPage from "@/pages/functions/FunctionOverviewPage";

import { functionOverviewRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/functions/$id/")({
  ...functionOverviewRouteOptions,
  component: FunctionOverviewPage,
});
