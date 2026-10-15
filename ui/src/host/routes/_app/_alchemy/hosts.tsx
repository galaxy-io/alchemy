import { createFileRoute } from "@tanstack/react-router";

import HostsPage from "@/pages/hosts/HostsPage";

import { hostsRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/hosts")({
  ...hostsRouteOptions,
  component: HostsPage,
});
