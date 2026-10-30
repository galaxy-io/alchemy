import { createFileRoute } from "@tanstack/react-router";

import FunctionContractPage from "@/pages/functions/FunctionContractPage";

import { functionContractRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/functions/$id/contract")({
  ...functionContractRouteOptions,
  component: FunctionContractPage,
});
