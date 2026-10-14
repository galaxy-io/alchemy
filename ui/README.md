# Alchemy UI

Web UI for Alchemy, built with Vite + React + [@galaxy-io/dls](https://www.npmjs.com/package/@galaxy-io/dls) (the Galaxy Design Language System), talking to the ConnectRPC `FunctionsService` and `MetricsService`.

## Develop

```bash
just infra   # postgres + nats
just vm      # the KVM host VM
just dev     # host + server (:8780) + this UI (:5173)
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
| `./paths` | `AlchemyPath` and `createAlchemyHref` |
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
   - The `/` → `observability` redirect as a host file with an absolute path. `images/$id/` is the image's overview, not a redirect.
   - No `defaultPendingComponent`, `defaultErrorComponent` or `defaultNotFoundComponent` is needed. The route options carry Alchemy's own.
6. **Own the query client.** Skip retries for `NotFound`, `PermissionDenied`, `Unauthenticated`, `InvalidArgument` and `Unimplemented`, or a missing function retries for about 7s before its not-found page. A `staleTime` of 30s is recommended.
7. **Proxy** `/functions.v1.FunctionsService` and `/metrics.v1.MetricsService` to the Alchemy API at the transport's `baseUrl`. Filament also serves `metrics.v1.MetricsService`, so a host that mounts both puts one product behind a prefix.
8. **Give the layout a box.** `AlchemyLayout` fills its parent, so the parent needs a definite height (a flex child with `min-height: 0`).

### Releasing

`@galaxy-io/alchemy-ui` is published to npm by `.github/workflows/ui-release.yaml`. The `alchemy-ui` release-please component bumps `package.json` from conventional commits under `ui/`. Merging its release PR tags `alchemy-ui-x.y.z`, and the workflow then runs `just ui-check` and publishes through npm trusted publishing, with no token.

## Codegen

TypeScript clients are generated from `../protos` (minus the internal `host.v1` and `supervisor.v1` contracts) into `src/gen/` (checked in):

```bash
cd ui && pnpm codegen   # buf generate
```

Re-run after changing the protos. `src/host/routeTree.gen.ts` is generated by the TanStack Router plugin during `pnpm dev` / `pnpm build` and is also checked in.

## Conventions

Everything in `src/` follows the `alchemy-ui` skill at `.agents/skills/alchemy-ui`, which defers to Filament's `filament-ui` skill and the org's `galaxy-ui` skill. Read its `SKILL.md` before adding a screen.
