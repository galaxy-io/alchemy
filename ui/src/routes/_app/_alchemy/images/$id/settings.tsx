import { createFileRoute } from "@tanstack/react-router";

import FunctionSettingsPage from "@/pages/functions/FunctionSettingsPage";

export const Route = createFileRoute("/_app/_alchemy/images/$id/settings")({
  component: FunctionSettingsPage,
});
