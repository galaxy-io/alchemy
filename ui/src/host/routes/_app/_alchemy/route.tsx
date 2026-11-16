import type { FC } from "react";

import { createFileRoute } from "@tanstack/react-router";

import AlchemyLayout from "@/module/AlchemyLayout";
import { alchemyLayoutRouteOptions } from "@/module/routes";

import { getHostRuntimeConfig } from "@/host/utils";

const HOST_RUNTIME_CONFIG = getHostRuntimeConfig();

const HostAlchemyLayout: FC = () => <AlchemyLayout productUrls={HOST_RUNTIME_CONFIG.products} />;

export const Route = createFileRoute("/_app/_alchemy")({
  ...alchemyLayoutRouteOptions,
  component: HostAlchemyLayout,
});
