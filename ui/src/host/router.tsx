import { createRouter } from "@tanstack/react-router";

import AlchemyErrorComponent from "@/module/AlchemyErrorComponent";
import AlchemyPendingComponent from "@/module/AlchemyPendingComponent";

import { routeTree } from "@/host/routeTree.gen";

const DEFAULT_PRELOAD = "intent";
const DEFAULT_PRELOAD_STALE_TIME = 0;

export const router = createRouter({
  routeTree,
  defaultPreload: DEFAULT_PRELOAD,
  defaultPreloadStaleTime: DEFAULT_PRELOAD_STALE_TIME,
  defaultErrorComponent: AlchemyErrorComponent,
  defaultPendingComponent: AlchemyPendingComponent,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
