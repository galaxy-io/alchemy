export enum Flow {
  CREATE_FUNCTION = "CREATE_FUNCTION",
  CREATE_FUNCTION_VERSION = "CREATE_FUNCTION_VERSION",
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    alchemy?: boolean;
  }
}

export enum AlchemyNavItem {
  OBSERVABILITY = "OBSERVABILITY",
  FUNCTIONS = "FUNCTIONS",
  HOSTS = "HOSTS",
  INVOCATIONS = "INVOCATIONS",
}

export enum GalaxyProduct {
  ALCHEMY = "alchemy",
  FILAMENT = "filament",
}

export type GalaxyProductUrls = Partial<Record<GalaxyProduct, string>>;
