import { createFileRoute } from "@tanstack/react-router";

import FunctionSettingsPage from "@/pages/functions/FunctionSettingsPage";

import { functionSettingsRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/images/$id/settings")({
  ...functionSettingsRouteOptions,
  component: FunctionSettingsPage,
});
