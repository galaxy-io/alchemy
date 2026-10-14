import { createFileRoute } from "@tanstack/react-router";

import NotFoundPage from "@/pages/NotFoundPage";

import { alchemyNotFoundRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy/$")({
  ...alchemyNotFoundRouteOptions,
  component: NotFoundPage,
});
