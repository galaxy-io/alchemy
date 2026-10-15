import type { FC } from "react";

import type { ErrorComponentProps } from "@tanstack/react-router";

import FunctionNotFoundPage from "@/pages/functions/FunctionNotFoundPage";

import AlchemyErrorComponent from "@/module/AlchemyErrorComponent";
import AlchemyFunctionErrorComponent from "@/module/AlchemyFunctionErrorComponent";
import AlchemyPendingComponent from "@/module/AlchemyPendingComponent";
import {
  alchemyLayoutSearchSchema,
  functionSearchSchema,
  functionsSearchSchema,
  functionWorkbenchSearchSchema,
  invocationsSearchSchema,
  observabilitySearchSchema,
} from "@/module/schemas";

interface AlchemyRouteComponents {
  errorComponent: FC<ErrorComponentProps>;
  pendingComponent: FC;
}

const createAlchemyRouteOptions = <TOptions extends object>(
  options: TOptions,
): AlchemyRouteComponents & TOptions => ({
  errorComponent: AlchemyErrorComponent,
  pendingComponent: AlchemyPendingComponent,
  ...options,
});

export const alchemyLayoutRouteOptions = createAlchemyRouteOptions({
  validateSearch: alchemyLayoutSearchSchema,
  staticData: { alchemy: true },
});

export const alchemyNotFoundRouteOptions = createAlchemyRouteOptions({});

export const observabilityRouteOptions = createAlchemyRouteOptions({
  validateSearch: observabilitySearchSchema,
});

export const functionsRouteOptions = createAlchemyRouteOptions({
  validateSearch: functionsSearchSchema,
});

export const functionRouteOptions = createAlchemyRouteOptions({
  validateSearch: functionSearchSchema,
  errorComponent: AlchemyFunctionErrorComponent,
  notFoundComponent: FunctionNotFoundPage,
});

export const functionOverviewRouteOptions = createAlchemyRouteOptions({});

export const functionWorkbenchRouteOptions = createAlchemyRouteOptions({
  validateSearch: functionWorkbenchSearchSchema,
});

export const functionContractRouteOptions = createAlchemyRouteOptions({});

export const functionVersionsRouteOptions = createAlchemyRouteOptions({});

export const functionInvocationsRouteOptions = createAlchemyRouteOptions({
  validateSearch: invocationsSearchSchema,
});

export const functionSettingsRouteOptions = createAlchemyRouteOptions({});

export const hostsRouteOptions = createAlchemyRouteOptions({});

export const invocationsRouteOptions = createAlchemyRouteOptions({
  validateSearch: invocationsSearchSchema,
});
