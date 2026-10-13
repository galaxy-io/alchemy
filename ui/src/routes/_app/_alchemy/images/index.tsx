import { createFileRoute } from "@tanstack/react-router";

import FunctionsPage from "@/pages/functions/FunctionsPage";

import { functionsRoute } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/images/")({
  ...functionsRoute,
  component: FunctionsPage,
});
