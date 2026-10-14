import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

export const IS_DEBUG = process.env.NODE_ENV !== "production";

export const GITHUB_REPO_URL: string = "https://github.com/galaxy-io/alchemy";

export const LIST_SEARCH_DEBOUNCE_MS = 300;

export const ACTIVE_INVOCATION_STATUSES = new Set<InvocationStatus>([
  InvocationStatus.PENDING,
  InvocationStatus.STARTING,
  InvocationStatus.RUNNING,
]);
