import { createFileRoute } from "@tanstack/react-router";

import AlchemyLayout from "@/module/AlchemyLayout";
import { alchemyLayoutRoute } from "@/module/routes";

export const Route = createFileRoute("/_app/_alchemy")({
  ...alchemyLayoutRoute,
  component: AlchemyLayout,
});
