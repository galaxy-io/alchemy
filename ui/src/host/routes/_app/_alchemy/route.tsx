import { createFileRoute } from "@tanstack/react-router";

import AlchemyLayout from "@/module/AlchemyLayout";
import { alchemyLayoutRouteOptions } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy")({
  ...alchemyLayoutRouteOptions,
  component: AlchemyLayout,
});
