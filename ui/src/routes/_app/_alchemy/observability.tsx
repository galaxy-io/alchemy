import { createFileRoute } from "@tanstack/react-router";

import ObservabilityPage from "@/pages/observability/ObservabilityPage";

import { observabilityRoute } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/observability")({
  ...observabilityRoute,
  component: ObservabilityPage,
});
