import { createFileRoute } from "@tanstack/react-router";

import FunctionWorkbenchPage from "@/pages/functions/FunctionWorkbenchPage";

export const Route = createFileRoute("/_app/_alchemy/images/$id/workbench")({
  component: FunctionWorkbenchPage,
});
