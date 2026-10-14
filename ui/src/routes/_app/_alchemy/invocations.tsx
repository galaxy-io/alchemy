import { createFileRoute } from "@tanstack/react-router";

import InvocationsPage from "@/pages/invocations/InvocationsPage";

import { invocationsRoute } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/invocations")({
  ...invocationsRoute,
  component: InvocationsPage,
});
