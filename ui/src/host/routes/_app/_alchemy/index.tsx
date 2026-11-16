import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_alchemy/")({
  beforeLoad: () => {
    throw redirect({ to: "/observability", search: true });
  },
});
