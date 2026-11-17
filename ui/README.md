# Alchemy UI

Web UI for Alchemy, built with Vite + React + [@galaxy-io/dls](https://www.npmjs.com/package/@galaxy-io/dls) (the Galaxy Design Language System), talking to the ConnectRPC `FunctionsService` and `MetricsService`.

## Develop

```bash
just infra   # postgres + nats
just vm      # the KVM host VM
just dev     # host + server (:8780) + this UI (:5174)
```

Or run the pieces individually: `just host`, `just server` and `just ui`.

The dev server proxies `/functions.v1.FunctionsService` and `/metrics.v1.MetricsService` to `http://localhost:8780` (the port the justfile server recipe binds), so the app is same-origin in dev and prod alike. Set `API_PROXY_TARGET` to proxy to another local server, or `VITE_API_URL` to point the app at a remote Alchemy instance.

## Build & embed

The server binary embeds this app. `just binaries` builds `build/` and compiles
`cmd/server` with `-tags embedui`. To build those pieces from the repository
root:

```bash
just ui-build                                # tsc + vite build → ui/build/
go build -tags embedui -o bin/server ./cmd/server   # binary serving API + UI
```

Without `-tags embedui`, `ui.Handler()` serves a placeholder page and `go build ./...` needs no Node toolchain.

## Module and host

The same `src/` tree also builds `@galaxy-io/alchemy-ui`, a module a Galaxy host mounts under any path.

```bash
pnpm build:lib       # vite.lib.config.ts → dist/
pnpm check:package   # publint and the dist import scan
pnpm check:host      # type-check and build the fixture host against the package
```

`src/host/` is standalone-only and never ships. `src/module/` is the module's surface. The public API is the `exports` map in `package.json`.

| Subpath | What |
|---|---|
| `./paths` | `AlchemyPath`, `createAlchemyHref`, `Flow`, `createAlchemyFlowSearch` and the `AlchemyReturnSearch` type |
| `./links` | `createAlchemyFunctionHref` and `parseAlchemyReturnSearch`, the link format other products use. No components |
| `./routes` | one `*RouteOptions` per page, plus `alchemyLayoutRouteOptions` and `alchemyNotFoundRouteOptions` |
| `./AlchemyLayout` | the shell, its sidebar and the URL-driven drawer and modals |
| `./commands` | `useAlchemyCommandItems({ base, transport })` for a host command palette |
| `./pages/<Page>` | `ObservabilityPage`, `FunctionsPage`, `FunctionPage`, `FunctionOverviewPage`, `FunctionWorkbenchPage`, `FunctionContractPage`, `FunctionVersionsPage`, `FunctionInvocationsPage`, `FunctionSettingsPage`, `InvocationsPage`, `HostsPage`, `NotFoundPage` |
| `./styles.css` | every class the module renders, all prefixed `alchemy-` |

`fixtures/host/` is the reference host and the executable copy of this contract. A host does the following.

1. **Install** `@galaxy-io/alchemy-ui` and every peer dependency in `package.json`. The host `tsconfig` uses `"moduleResolution": "bundler"`, and the host bundler replaces `process.env.NODE_ENV`.
2. **Import the CSS once** at the app entry, in this order. `@galaxy-io/dls/styles.css`, `tokens.css`, `fonts.css`, then `@galaxy-io/alchemy-ui/styles.css`.
3. **Mount the providers** above the router. `GalaxyProvider` owns the theme, then `QueryClientProvider` and `RouterProvider`.
4. **Give Alchemy a transport.** Alchemy reads the connect-query transport from context. Nest a `TransportProvider` in the layout route's component when the host's global transport does not reach Alchemy's services, and pass the same instance to `useAlchemyCommandItems` when the palette lives outside the mount.
5. **Add the routes.**
   - A layout route `{ ...alchemyLayoutRouteOptions, component: Layout }`.
   - One child per page, `{ ...functionsRouteOptions, component: FunctionsPage }`.
   - A `$` splat `{ ...alchemyNotFoundRouteOptions, component: NotFoundPage }`.
   - The `/` → `observability` redirect as a host file with an absolute path. `functions/$id/` is the function's overview, not a redirect.
   - No `defaultPendingComponent`, `defaultErrorComponent` or `defaultNotFoundComponent` is needed. The route options carry Alchemy's own.
6. **Own the query client.** Skip retries for `NotFound`, `PermissionDenied`, `Unauthenticated`, `InvalidArgument` and `Unimplemented`, or a missing function retries for about 7s before its not-found page. A `staleTime` of 30s is recommended.
7. **Proxy** `/functions.v1.FunctionsService` and `/metrics.v1.MetricsService` to the Alchemy API at the transport's `baseUrl`. When another product the host mounts also serves `metrics.v1.MetricsService`, put one product behind a prefix.
8. **Give the layout a box.** `AlchemyLayout` fills its parent, so the parent needs a definite height (a flex child with `min-height: 0`).

### Deep links into a flow

Another product opens Alchemy's create wizard with `createAlchemyFunctionHref(alchemyUrl, returnTo, seed)` from `./links`. `alchemyUrl` is Alchemy's mount path on the same origin or its full URL on its own domain. A host that mounts Alchemy itself can link in-app with `createAlchemyFlowSearch(Flow.CREATE_FUNCTION, seed)` on the module's `./functions` route instead. The seed carries a suggested `functionName` and `functionDescription`, a `runtime` id and the function's `contract`. Arrow contracts list their fields as `{ name, type, nullable }` with Arrow type tokens such as `utf8`, `int64` or `timestamp[us, tz=UTC]`. JSON Schema contracts carry each side as JSON text. A seeded contract is locked in the wizard, so the function always matches what the caller sends. A contract that does not parse is dropped and the wizard opens as usual.

`returnTo` is where the user goes back to, and `returnLabel` names the caller in the wizard. It is a path in the host app or a full URL. A full URL on another origin is followed only when that origin belongs to a Galaxy product in `AlchemyLayout`'s `productUrls` prop, and any other `returnTo` is ignored so the wizard closes in place. The host's own origin moves within the router and a product origin loads the page. The server writes its runtime config into `index.html` as the JSON script `alchemy-runtime-config`, with `products` set by the `GALAXY_<PRODUCT>_URL` variables, and the standalone app passes them to the layout. So a standalone Filament on its own domain gets its users back once `GALAXY_FILAMENT_URL` is set. Cancel returns to `returnTo` as it is. Create returns to it with `alchemyFunctionId` and `alchemyFunctionVersion` added to its search, which the caller reads with `parseAlchemyReturnSearch` as an `AlchemyReturnSearch`. The new version may still be building. Seeds never carry environment values or secrets.

`fixtures/host/` links to a seeded create that returns to the host home and shows the function it got back.

### Releasing

`@galaxy-io/alchemy-ui` is published to npm by `.github/workflows/ui-release.yaml`. The `alchemy-ui` release-please component bumps `package.json` from conventional commits under `ui/`. Merging its release PR tags `alchemy-ui-x.y.z`, and the workflow then runs `just ui-check` and publishes through npm trusted publishing, with no token.

## Codegen

TypeScript clients are generated from `../protos` (minus the internal `host.v1` and `supervisor.v1` contracts) into `src/gen/` (checked in):

```bash
cd ui && pnpm codegen   # buf generate
```

Re-run after changing the protos. `src/host/routeTree.gen.ts` is generated by the TanStack Router plugin during `pnpm dev` / `pnpm build` and is also checked in.

## Conventions

Everything in `src/` follows the `alchemy-ui` skill at `.agents/skills/alchemy-ui`, loaded with the org's `galaxy-ui` skill. Read its `SKILL.md` before adding a screen.
