export enum AlchemyPath {
  OBSERVABILITY = "./observability",
  FUNCTIONS = "./images",
  FUNCTION = "./images/$id",
  FUNCTION_WORKBENCH = "./images/$id/workbench",
  FUNCTION_CONTRACT = "./images/$id/contract",
  FUNCTION_VERSIONS = "./images/$id/versions",
  FUNCTION_INVOCATIONS = "./images/$id/invocations",
  FUNCTION_SETTINGS = "./images/$id/settings",
  HOSTS = "./hosts",
  INVOCATIONS = "./invocations",
}

export const createAlchemyHref = (path: AlchemyPath, params: Record<string, string> = {}) =>
  path.replace(/\$(\w+)/g, (_, key: string) => encodeURIComponent(params[key] ?? ""));
