import { createFileRoute } from "@tanstack/react-router";

import FunctionOverviewPage from "@/pages/functions/FunctionOverviewPage";

export const Route = createFileRoute("/_app/_alchemy/images/$id/")({
  component: FunctionOverviewPage,
});
