import { createFileRoute } from "@tanstack/react-router";

import FunctionVersionsPage from "@/pages/functions/FunctionVersionsPage";

import { functionVersionsRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/images/$id/versions")({
  ...functionVersionsRouteOptions,
  component: FunctionVersionsPage,
});
