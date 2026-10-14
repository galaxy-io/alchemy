import { createFileRoute } from "@tanstack/react-router";

import AppLayout from "@/host/layouts/app/AppLayout";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});
