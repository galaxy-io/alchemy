import { createFileRoute } from "@tanstack/react-router";

import FunctionWorkbenchPage from "@/pages/functions/FunctionWorkbenchPage";

import { functionWorkbenchRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/functions/$id/workbench")({
  ...functionWorkbenchRouteOptions,
  component: FunctionWorkbenchPage,
});
