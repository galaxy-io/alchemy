import { createFileRoute } from "@tanstack/react-router";

import HostsPage from "@/pages/hosts/HostsPage";

export const Route = createFileRoute("/_app/_alchemy/hosts")({
  component: HostsPage,
});
