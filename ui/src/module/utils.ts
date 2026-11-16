import { ALCHEMY_RETURN_PROTOCOLS } from "@/module/constants";
import type { GalaxyProductUrls } from "@/module/types";

export const getGalaxyProductOrigins = (productUrls: GalaxyProductUrls, origin: string) =>
  Object.values(productUrls).flatMap((productUrl) => {
    if (!productUrl) return [];
    try {
      return [new URL(productUrl, origin).origin];
    } catch {
      return [];
    }
  });

export const resolveAlchemyReturnUrl = (
  returnTo: string,
  origin: string,
  trustedOrigins: readonly string[],
): URL | undefined => {
  try {
    const url = new URL(returnTo, origin);
    const isTrustedOrigin = url.origin === origin || trustedOrigins.includes(url.origin);
    return ALCHEMY_RETURN_PROTOCOLS.includes(url.protocol) && isTrustedOrigin ? url : undefined;
  } catch {
    return undefined;
  }
};
