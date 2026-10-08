import { createFileRoute } from "@tanstack/react-router";

import FunctionPage from "@/pages/functions/FunctionPage";

import { functionRoute } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/images/$id")({
  ...functionRoute,
  component: FunctionPage,
});
