import { match } from "ts-pattern";

import { GalaxyTheme } from "@galaxy-io/dls/theme/enums";

import type {
  Function as AlchemyFunction,
  FunctionVersion,
  Runtime,
} from "@/gen/functions/v1/functions_pb";

export const getFunctionCurrentVersion = (
  alchemyFunction: AlchemyFunction,
): FunctionVersion | undefined =>
  alchemyFunction.currentVersion?.id ? alchemyFunction.currentVersion : undefined;

export const getFunctionRuntime = (
  runtimes: Runtime[],
  image: string | undefined,
): Runtime | undefined => runtimes.find((runtime) => runtime.image === image);

export const getFunctionVersionRuntime = (
  runtimes: Runtime[],
  version: FunctionVersion | undefined,
): Runtime | undefined =>
  version?.spec?.source ? getFunctionRuntime(runtimes, version.spec.image) : undefined;

export const getFunctionRuntimeIconUrl = (
  runtime: Pick<Runtime, "darkIconUrl" | "lightIconUrl">,
  theme: GalaxyTheme.DARK | GalaxyTheme.LIGHT,
) =>
  match(theme)
    .with(GalaxyTheme.DARK, () => runtime.darkIconUrl)
    .with(GalaxyTheme.LIGHT, () => runtime.lightIconUrl)
    .exhaustive();
