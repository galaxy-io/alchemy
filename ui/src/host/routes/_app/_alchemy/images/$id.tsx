import { createFileRoute } from "@tanstack/react-router";

import FunctionPage from "@/pages/functions/FunctionPage";

import { functionRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/images/$id")({
  ...functionRouteOptions,
  component: FunctionPage,
});
