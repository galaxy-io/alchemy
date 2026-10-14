import { createRouter } from "@tanstack/react-router";

import PendingLayout from "@/layouts/PendingLayout";

import { AlchemyErrorComponent } from "@/module/routes";
import { routeTree } from "@/routeTree.gen";

const DEFAULT_PRELOAD = "intent";
const DEFAULT_PRELOAD_STALE_TIME = 0;

const DefaultPendingComponent = () => {
  return <PendingLayout />;
};

export const router = createRouter({
  routeTree,
  defaultPreload: DEFAULT_PRELOAD,
  defaultPreloadStaleTime: DEFAULT_PRELOAD_STALE_TIME,
  defaultErrorComponent: AlchemyErrorComponent,
  defaultPendingComponent: DefaultPendingComponent,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
