import { createFileRoute } from "@tanstack/react-router";

import FunctionInvocationsPage from "@/pages/functions/FunctionInvocationsPage";

import { functionInvocationsRoute } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/images/$id/invocations")({
  ...functionInvocationsRoute,
  component: FunctionInvocationsPage,
});
