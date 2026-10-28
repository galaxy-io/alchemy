import { createFileRoute } from "@tanstack/react-router";

import FunctionsPage from "@/pages/functions/FunctionsPage";

import { functionsRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/functions/")({
  ...functionsRouteOptions,
  component: FunctionsPage,
});
