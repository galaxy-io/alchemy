import { createFileRoute } from "@tanstack/react-router";

import InvocationsPage from "@/pages/invocations/InvocationsPage";

import { invocationsRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/invocations")({
  ...invocationsRouteOptions,
  component: InvocationsPage,
});
