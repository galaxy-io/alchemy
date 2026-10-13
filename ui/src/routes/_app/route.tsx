import { createFileRoute } from "@tanstack/react-router";

import AppLayout from "@/layouts/app/AppLayout";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});
