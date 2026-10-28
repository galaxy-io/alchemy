import { createFileRoute } from "@tanstack/react-router";

import FunctionInvocationsPage from "@/pages/functions/FunctionInvocationsPage";

import { functionInvocationsRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/functions/$id/invocations")({
  ...functionInvocationsRouteOptions,
  component: FunctionInvocationsPage,
});
