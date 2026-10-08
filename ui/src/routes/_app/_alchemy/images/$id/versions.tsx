import { createFileRoute } from "@tanstack/react-router";

import FunctionVersionsPage from "@/pages/functions/FunctionVersionsPage";

export const Route = createFileRoute("/_app/_alchemy/images/$id/versions")({
  component: FunctionVersionsPage,
});
