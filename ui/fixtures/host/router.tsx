import type { FC } from "react";

import { TransportProvider } from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-web";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  lazyRouteComponent,
  linkOptions,
  Outlet,
  redirect,
  useSearch,
} from "@tanstack/react-router";

import AlchemyLayout from "@galaxy-io/alchemy-ui/AlchemyLayout";
import { useAlchemyCommandItems } from "@galaxy-io/alchemy-ui/commands";
import { createAlchemyFunctionHref, parseAlchemyReturnSearch } from "@galaxy-io/alchemy-ui/links";
import {
  AlchemyPath,
  createAlchemyFlowSearch,
  Flow,
  GalaxyProduct,
  type GalaxyProductUrls,
} from "@galaxy-io/alchemy-ui/paths";
import {
  alchemyLayoutRouteOptions,
  alchemyNotFoundRouteOptions,
  functionContractRouteOptions,
  functionInvocationsRouteOptions,
  functionOverviewRouteOptions,
  functionRouteOptions,
  functionSettingsRouteOptions,
  functionsRouteOptions,
  functionVersionsRouteOptions,
  functionWorkbenchRouteOptions,
  hostsRouteOptions,
  invocationsRouteOptions,
  observabilityRouteOptions,
} from "@galaxy-io/alchemy-ui/routes";
import CommandPalette from "@galaxy-io/dls/navigation/CommandPalette";
import Text from "@galaxy-io/dls/text/Text";

const MOUNT_PATH = "alchemy";

const alchemyTransport = createConnectTransport({ baseUrl: "" });

const FIXTURE_PRODUCT_URLS: GalaxyProductUrls = {
  [GalaxyProduct.ALCHEMY]: `/${MOUNT_PATH}`,
  [GalaxyProduct.FILAMENT]: "https://filament.example.com",
};

const hostFunctionSearch = createAlchemyFlowSearch(Flow.CREATE_FUNCTION, {
  functionName: "orders-enrich",
  contract: {
    kind: "arrow",
    input: [{ name: "email", type: "utf8", nullable: true }],
    output: [{ name: "domain", type: "utf8", nullable: true }],
  },
  returnTo: "/",
  returnLabel: "the fixture host",
});

const HomePage: FC = () => {
  const commandItems = useAlchemyCommandItems({
    base: `/${MOUNT_PATH}`,
    transport: alchemyTransport,
  });
  const createdFunction = parseAlchemyReturnSearch(useSearch({ strict: false }));

  return (
    <>
      <Link to={`/${MOUNT_PATH}`}>Open the module</Link>
      <Link from={`/${MOUNT_PATH}`} to={AlchemyPath.FUNCTION_WORKBENCH} params={{ id: "f" }}>
        Open a function workbench
      </Link>
      <Link to={`/${MOUNT_PATH}/functions`} search={hostFunctionSearch}>
        Write a function for the host
      </Link>
      {createdFunction ? (
        <Text as="p">
          Created {createdFunction.alchemyFunctionId} version{" "}
          {String(createdFunction.alchemyFunctionVersion)}
        </Text>
      ) : null}
      <CommandPalette items={commandItems} shouldBindHotKey />
    </>
  );
};

const MountLayout: FC = () => (
  <TransportProvider transport={alchemyTransport}>
    <AlchemyLayout productUrls={FIXTURE_PRODUCT_URLS} />
  </TransportProvider>
);

const rootRoute = createRootRoute({ component: Outlet });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const mountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MOUNT_PATH,
  ...alchemyLayoutRouteOptions,
  component: MountLayout,
});

const mountIndexRoute = createRoute({
  getParentRoute: () => mountRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: `/${MOUNT_PATH}/observability` });
  },
});

const observabilityRoute = createRoute({
  getParentRoute: () => mountRoute,
  path: "observability",
  ...observabilityRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/ObservabilityPage")),
});

const notFoundRoute = createRoute({
  getParentRoute: () => mountRoute,
  path: "$",
  ...alchemyNotFoundRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/NotFoundPage")),
});

const functionsRoute = createRoute({
  getParentRoute: () => mountRoute,
  path: "functions",
  ...functionsRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/FunctionsPage")),
});

const functionRoute = createRoute({
  getParentRoute: () => mountRoute,
  path: "functions/$id",
  ...functionRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/FunctionPage")),
});

const functionOverviewRoute = createRoute({
  getParentRoute: () => functionRoute,
  path: "/",
  ...functionOverviewRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/FunctionOverviewPage")),
});

const functionWorkbenchRoute = createRoute({
  getParentRoute: () => functionRoute,
  path: "workbench",
  ...functionWorkbenchRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/FunctionWorkbenchPage")),
});

const functionContractRoute = createRoute({
  getParentRoute: () => functionRoute,
  path: "contract",
  ...functionContractRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/FunctionContractPage")),
});

const functionInvocationsRoute = createRoute({
  getParentRoute: () => functionRoute,
  path: "invocations",
  ...functionInvocationsRouteOptions,
  component: lazyRouteComponent(
    () => import("@galaxy-io/alchemy-ui/pages/FunctionInvocationsPage"),
  ),
});

const functionVersionsRoute = createRoute({
  getParentRoute: () => functionRoute,
  path: "versions",
  ...functionVersionsRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/FunctionVersionsPage")),
});

const functionSettingsRoute = createRoute({
  getParentRoute: () => functionRoute,
  path: "settings",
  ...functionSettingsRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/FunctionSettingsPage")),
});

const invocationsRoute = createRoute({
  getParentRoute: () => mountRoute,
  path: "invocations",
  ...invocationsRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/InvocationsPage")),
});

const hostsRoute = createRoute({
  getParentRoute: () => mountRoute,
  path: "hosts",
  ...hostsRouteOptions,
  component: lazyRouteComponent(() => import("@galaxy-io/alchemy-ui/pages/HostsPage")),
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  mountRoute.addChildren([
    mountIndexRoute,
    observabilityRoute,
    functionsRoute,
    functionRoute.addChildren([
      functionOverviewRoute,
      functionWorkbenchRoute,
      functionContractRoute,
      functionVersionsRoute,
      functionInvocationsRoute,
      functionSettingsRoute,
    ]),
    invocationsRoute,
    hostsRoute,
    notFoundRoute,
  ]),
]);

export const router = createRouter({ routeTree });

export const unknownSearchKeyLink = linkOptions({
  to: `/${MOUNT_PATH}/functions`,
  // @ts-expect-error a module route rejects search keys its schema does not declare
  search: { nope: 1 },
});

export const unknownContractKindSearch = createAlchemyFlowSearch(Flow.CREATE_FUNCTION, {
  // @ts-expect-error a flow seed only takes the contract kinds Alchemy declares
  contract: { kind: "protobuf", input: "", output: "" },
});

export const otherProductFunctionHref = createAlchemyFunctionHref(
  "https://alchemy.example.com",
  "https://filament.example.com/pipelines/p/canvas",
  {
    functionName: "orders-enrich",
    // @ts-expect-error a link seed carries only the contract kinds Alchemy declares
    contract: { kind: "protobuf", input: "", output: "" },
  },
);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
