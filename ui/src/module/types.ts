export enum Flow {
  CREATE_FUNCTION = "CREATE_FUNCTION",
  CREATE_FUNCTION_VERSION = "CREATE_FUNCTION_VERSION",
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    alchemy?: boolean;
  }
}
