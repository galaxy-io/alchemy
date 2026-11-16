import { ALCHEMY_RETURN_PROTOCOLS } from "@/module/constants";

export const resolveAlchemyReturnUrl = (
  returnTo: string,
  origin: string,
  returnOrigins: readonly string[],
): URL | undefined => {
  try {
    const url = new URL(returnTo, origin);
    const isAllowedOrigin = url.origin === origin || returnOrigins.includes(url.origin);
    return ALCHEMY_RETURN_PROTOCOLS.includes(url.protocol) && isAllowedOrigin ? url : undefined;
  } catch {
    return undefined;
  }
};
