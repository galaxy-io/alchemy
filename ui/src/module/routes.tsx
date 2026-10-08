import { Code, ConnectError } from "@connectrpc/connect";
import { BugIcon } from "@phosphor-icons/react";
import type { ErrorComponentProps } from "@tanstack/react-router";

import ErrorLayout from "@/layouts/ErrorLayout";

import FunctionNotFoundPage from "@/pages/functions/FunctionNotFoundPage";

import {
  alchemyLayoutSearchSchema,
  functionInvocationsSearchSchema,
  functionSearchSchema,
  functionsSearchSchema,
  invocationsSearchSchema,
  observabilitySearchSchema,
} from "@/module/schemas";

/*
 * Route contents without paths or components. A host decides where each screen lives and writes
 * one file route per bundle, adding the page it imports so the router plugin can code-split it:
 * `createFileRoute("/_app/_main/_alchemy/images/$id")({ ...functionRoute, component: FunctionPage })`.
 * The layout bundle (`AlchemyLayout`) must wrap every other bundle: it validates the overlay params
 * and marks the module's base.
 */

export const AlchemyErrorComponent = ({ error }: Pick<ErrorComponentProps, "error">) => (
  <ErrorLayout
    icon={BugIcon}
    header="Looks like there was a glitch in the matrix"
    description="Please try again later"
    error={error instanceof Error ? error : undefined}
  />
);

const FunctionErrorComponent = ({ error }: ErrorComponentProps) =>
  error instanceof ConnectError && error.code === Code.NotFound ? (
    <FunctionNotFoundPage />
  ) : (
    <AlchemyErrorComponent error={error} />
  );

export const alchemyLayoutRoute = {
  validateSearch: alchemyLayoutSearchSchema,
  staticData: { alchemy: true },
};

export const observabilityRoute = {
  validateSearch: observabilitySearchSchema,
};

export const functionsRoute = {
  validateSearch: functionsSearchSchema,
};

export const functionRoute = {
  validateSearch: functionSearchSchema,
  errorComponent: FunctionErrorComponent,
  notFoundComponent: FunctionNotFoundPage,
};

export const functionInvocationsRoute = {
  validateSearch: functionInvocationsSearchSchema,
};

export const invocationsRoute = {
  validateSearch: invocationsSearchSchema,
};
