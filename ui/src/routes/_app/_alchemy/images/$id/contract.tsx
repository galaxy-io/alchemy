import { createFileRoute } from "@tanstack/react-router";

import FunctionContractPage from "@/pages/functions/FunctionContractPage";

export const Route = createFileRoute("/_app/_alchemy/images/$id/contract")({
  component: FunctionContractPage,
});
