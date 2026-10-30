export enum AlchemyPath {
  OBSERVABILITY = "./observability",
  FUNCTIONS = "./functions",
  FUNCTION = "./functions/$id",
  FUNCTION_WORKBENCH = "./functions/$id/workbench",
  FUNCTION_CONTRACT = "./functions/$id/contract",
  FUNCTION_VERSIONS = "./functions/$id/versions",
  FUNCTION_INVOCATIONS = "./functions/$id/invocations",
  FUNCTION_SETTINGS = "./functions/$id/settings",
  HOSTS = "./hosts",
  INVOCATIONS = "./invocations",
}

export const createAlchemyHref = (path: AlchemyPath, params: Record<string, string> = {}) =>
  path.replace(/\$(\w+)/g, (_, key: string) => encodeURIComponent(params[key] ?? ""));
