---
name: alchemy-ui
description: Design and build Alchemy's web UI (ui/). Who uses Alchemy, its core flows and screens, the conventions every file follows, the module surface (AlchemyLayout, AlchemyPath, route options, URL hooks), the query layer over FunctionsService and MetricsService, and the gates. Use whenever someone designs, builds or reviews anything under ui/, adds a screen, route, search param, query hook, mutation, form, table, dashboard panel, drawer, modal or settings section, wires a new RPC into the UI, or writes Alchemy UI copy. Load the galaxy-ui skill alongside it for the Galaxy app architecture and @galaxy-io/dls.
---

# Building Alchemy UI

Alchemy's `ui/` is a Galaxy app: the architecture the org's `galaxy-ui` skill describes, with Alchemy's domain in it. One source tree builds the standalone app and the `@galaxy-io/alchemy-ui` module a Galaxy host mounts. When a question is not answered here, find the nearest existing file in `ui/src` and copy its shape.

## The rulebook

1. **`galaxy-ui`** owns the Galaxy app architecture (stack, file contract, routing, data, screens, forms, modules, workflow) and `@galaxy-io/dls` (components, tokens, UX patterns).
2. **This skill** records Alchemy's product, screens, names and conventions. Where it says something, it wins for Alchemy.

## The product

| | |
|---|---|
| What | A runtime for typed functions. A function is an OCI image plus a contract (JSON Schema or Arrow). Every version is built into a root filesystem and every invocation runs in its own Firecracker microVM |
| Users | Engineers deploy functions and call them from code. Ops watch latency, failures and host capacity |
| Feel | Fast, calm, safe, in that order. Minimal: one header, one primary action, few columns, no explanatory prose |
| Core flows | Create a function from an image, ship a new version, run it in the workbench, triage a failed invocation, watch latency and cold starts, check host capacity |

## Screens

The design reference is the `feat/examples` proof of concept: same screens, same density, same copy. The entity is a "function" in code and in the UI. A function runs from an OCI image of its own or from source files on a runtime image (`python:3.13`, `node:24`, `go:1.27`, `rust:1.99`, the last two compiled on a host first), and "image" in copy means the OCI image only.

**Widgets carry an icon.** Observability widgets take a Phosphor `icon` (Invocations `ChartBarIcon`, Latency `TimerIcon`, Traffic `CalendarDotsIcon`, History `ListIcon`), and entity cards reuse their nav item's icon (function cards `CubeIcon`, or the runtime's logo beside the name when the current version is built from source, host cards `CpuIcon`). Settings sections have none. Counts beside a section label are a `TERTIARY` `X_SMALL` `Chip`.

**Never join values with a middle dot (`·`) in UI copy.** Give each value its own slot: a table column, a `Stat`, a second row under a `Divider`, a second line in a tooltip, an Alert header over its body. A label that needs a qualifier is reworded ("Last 24 hours"). Grep `·` in `src/` before handing over.

| Route (module-relative) | Page | Job |
|---|---|---|
| `./observability` | `ObservabilityPage` | KPI row, invocations by status, mean latency by start kind, weekday × hour traffic heatmap, then History: a flush, full-height infinite invocations table that takes over the scroll, windowed to the timeframe and filtered by the chart selection (`invocationsBucket`, `invocationsStatus`) |
| `./functions` | `FunctionsPage` | Cards: current version, invocations in the last 24 hours, success, mean duration, last ten statuses. New function (`Flow.CREATE_FUNCTION`) |
| `./functions/$id` | `FunctionPage` + `FunctionOverviewPage` | Heading with version select, build banner, New version (`Flow.CREATE_FUNCTION_VERSION`) and Invoke. Overview: 24h KPIs and the function's invocations |
| `./functions/$id/workbench` | `FunctionWorkbenchPage` | Files, editor and result. The tree holds the version's source files first (from `GetFunctionVersion`, editable, `?file=source:<path>`; Build ships the edits as a new version), then `input.json` (editable), `contract/input.json`, `contract/output.json` and `spec.json` (read-only); `?file=` selects one; ⌘↵ runs the READY version. The result is the drawer's layout: the full invocation id (opens the drawer) with a copy button, `InvocationOutcome` (the outcome header, then on a failure the reason in mono (`platform_error` or the function error's message) with one line per contract violation, path then message, then the phase bar), the output, and `InvocationLogsSplit`'s resizable logs strip |
| `./functions/$id/contract` | `FunctionContractPage` | Input and output islands, each a read-only TypeScript-highlighted type signature (`name?: type`, descriptions as `//` comments, nested objects indented; JSON Schema and Arrow render the same way) with a copy button for the source schema |
| `./functions/$id/versions` | `FunctionVersionsPage` | Version + current chip, status, image, vCPU, memory, build time, created. The expanded row sits on `background.primary`: a one-line strip of `Stat`s, label above value, each on one line, truncated with the full value in a tooltip except the digest (digest always in full, contract, files each with its runtime logo, command, timeout, rootfs right-aligned; the short ones size to content, files and command share the rest), and no build log. Row actions: open in workbench (READY), view contract, retry build (FAILED) |
| `./functions/$id/invocations` | `FunctionInvocationsPage` | The function's invocations, filtered by status and timeframe |
| `./functions/$id/settings` | `FunctionSettingsPage` | General, Runtime (spec as JSON), Danger zone |
| `./invocations` | `InvocationsPage` | Every invocation, filtered by status and timeframe |
| `./hosts` | `HostsPage` | A horizontally scrolling strip of fixed-width host cards: a slot map (busy slots open their invocation), then under a divider one four-column stat grid with no divider inside it: capacity (instances, memory, cached images, rootfs cache), then runtime (uptime, Firecracker, kernel). Below a hairline, an "Instances" header and a flush instances table (status, function, version, start, vCPU, memory, age) whose rows are not clickable, that fills the rest of the page |
| layout param `invocationId` | `InvocationDrawer` | Under a header divider, `InvocationLogsSplit`: `InvocationOutcome` (the outcome header, then on a failure the reason in mono (`platform_error` or the function error's message) with one line per contract violation, path then message, then the phase bar) and facts scroll on top, the logs are a resizable bottom strip whose height persists, with no copy button |

The create wizard (`flow=CREATE_FUNCTION`, `components/create/`) is a fullscreen, flush Modal with the Stepper in the Modal's `sidebar`: steps Choose source (two cards, Code or Image, each led by a `RadioInput` left of its icon in one named group, the whole card clickable: Code picks a language, Image takes a reference), Define contract, Write code (Code only: file tabs, each with its runtime logo, over a full-height editor, seeded with a handler generated from the contract kind until the author edits it), Set resources, then Name function last (no review step); the sidebar is the Stepper widget over the current step's description; padded steps sit in a `ScrollArea` with 16px padding; the name step is an autofocused Name and a 12-row auto-growing Description. `flow=CREATE_FUNCTION_VERSION` drops the name step.

**Other products open the wizard by URL.** `createAlchemyFlowSearch(flow, seed)` in `module/paths.ts` resets every flow key and applies the seed, and `useAlchemyFlowOpen` and the command palette go through it. The seed keys are `functionName`, `functionDescription`, `runtime`, `contract` (Arrow fields, or JSON Schema text per side), `returnTo` and `returnLabel`. The wizard reads them once per open and edits stay in memory. A seeded contract is the caller's, so Define contract shows it read-only under a banner naming `returnLabel`. A contract that does not parse is dropped whole and the wizard opens unlocked. `returnTo` is a path or a full URL, resolved by `resolveAlchemyReturnUrl` in `module/utils.ts` against the app's own origin and the origins of `AlchemyLayout`'s `productUrls`. Anything else is ignored. The standalone host reads `products` from the `alchemy-runtime-config` JSON script the server writes into `index.html` from `GALAXY_<PRODUCT>_URL`. Other products build the link with `createAlchemyFunctionHref` and read the result with `parseAlchemyReturnSearch`, both in `module/links.ts` (the `./links` export), so the link format has one owner. Keep `./links` free of components. With a `returnTo` that resolves, cancel goes back there and create goes back with `alchemyFunctionId` and `alchemyFunctionVersion` (`AlchemyReturnSearch`), through `useAlchemyReturn`. It moves within the router on the same origin and loads the page on another. Never put config, env values or secrets in a seed.

**Galaxy handoffs.** Products send people to each other with the same shape. The callee owns its link format in a component-free `./links` export, the seed rides in `flow` plus seed keys, `returnTo` and `returnLabel` say where to go back and who asked, and the result comes back as search keys prefixed with the callee's name (`alchemyFunctionId`). Every layout takes the same `productUrls` (`GalaxyProductUrls`, keyed by `GalaxyProduct`), the standalone server fills it from `GALAXY_<PRODUCT>_URL`, and a callee sends people back only to its own origin or a product origin in it. A new product adds itself to `GalaxyProduct`, to `Products` in `ui/config.go` and to `galaxy.productUrls` in the chart, in every product.

`?version=` on a function page selects the version the heading, workbench, contract and runtime show, and expands that row on Versions.

**Environment is one widget with two sections.** On the Choose source step, under the source, a collapsible Environment `Widget` (`CreateFunctionModalEnv`) with a count `Chip` in its `actions`, open by default only when it has rows. Inside it, two DLS `KeyValueInput`s at their default MEDIUM size: Variables, then Secrets, each label carrying its one-line description as a `labelTooltip`. Each owns its rows and its Add button, and `.env` paste comes with the component. Variables go to `spec.env`, secrets with a value to the request's `secret_values`; on a new version stored secrets load with an empty value, the Secrets section says "Leave a stored secret blank to keep its current value", and a blank one sends only its reference. Names are unique across both sections. A secret's value is never shown anywhere after it is entered: the Versions details do not mention secrets, and the spec JSON on Settings holds references only. Advanced below it holds Command alone. Never hand-roll rows for either section, and never add a per-row secret toggle.

## The module surface

| What | Names |
|---|---|
| Package | `@galaxy-io/alchemy-ui`, class prefix `alchemy` |
| Shell and paths | `AlchemyLayout`, `AlchemyPath`, `createAlchemyHref` |
| URL hooks | `useAlchemyNavigate`, `useAlchemySearchUpdate`, `useAlchemyFlowOpen`, `useAlchemyMatchRoute`, `useAlchemyBase`, plus one typed search hook per page |
| Route options | `alchemyLayoutRouteOptions`, `alchemyNotFoundRouteOptions`, one `*RouteOptions` per page (`functionRouteOptions`, `hostsRouteOptions`, ...) with `staticData: { alchemy: true }` |
| Error and pending | `AlchemyErrorComponent`, `AlchemyPendingComponent`, `AlchemyFunctionErrorComponent` |
| Command palette | `useAlchemyCommandItems({ base, transport })` |

## Conventions

- **Files.** One default export per file, filename equals the export, `FC`-typed components, feature prefix on every name, per-folder `constants.ts` / `types.ts` / `utils.ts`, no `index.ts`, no comments, `@/` imports only. A folder's JSX column definitions live in `constants.tsx`.
- **Types.** From the protos: `Function["id"]`, exhaustive `Record<ProtoEnum, ...>` maps in `constants.ts`, `UNSPECIFIED` handled by behaviour, `bigint` for int64. Branch per member with `match(...).exhaustive()`, never ternary chains. A component that takes `color` or `variant` gets one `Record<Status, { color } | { variant }>` spread onto it.
- **State.** One state object or a reducer provider for forms and wizards. No `useEffect` in `.tsx`. Derived values are computed at render.
- **URL.** Shared view state lives in search params declared in `module/schemas.ts` and read through `module/hooks.ts`. Defaults are written as `undefined`. Library code never calls `useSearch`, `useParams` or `useNavigate` and never uses absolute paths.
- **Data.** Every RPC goes through `src/api/queries/<resource>.ts`. Pages use suspense hooks, overlays and dashboard panels use plain hooks, invalidation lives in the mutation hook, toasts at the call site.
- **Styling.** DLS components and layout props first. A `styled` component only for what props cannot express, with `t` tokens, never raw px or hex.

## Alchemy specifics

| Topic | Rule |
|---|---|
| Auth | None. `_app` is just `AppLayout`, the sidebar has no footer, theme lives in the command palette |
| The `Function` message | Always imported as `type Function as AlchemyFunction`, and variables are `alchemyFunction`, never `fn`, so the global `Function` is never shadowed |
| Sorting | No sorting RPC. `listSearchParamsSchema` is `{ q }` |
| Versions | `createGetFunctionInput` always sets `includeVersions`, and `GetFunction` polls while a version is `BUILDING` |
| Metrics keys | The server groups `STATUS` and `START_KIND` by lowercase wire tokens (`"succeeded"`). Map them with `INVOCATION_STATUS_TO_WIRE_TOKEN_MAP` and `mapWireTokenToInvocationStatus` |
| Protocol | Only `INVOCATION_PROTOCOL_EXEC` is implemented server-side, so the wizard has no protocol field and always sends `EXEC` |
| Arrow contracts | Encoded and decoded with `apache-arrow` in `utils/arrow.ts`. Types are pyarrow tokens (`utf8`, `fixed_size_list<float32>[384]`) |
| Run status mark | `InvocationStatusSwatch` (square), a pulsing `Beacon` while starting or running. Instance state is a `Beacon` |
| Timeframes | `InvocationsTimeframe` (1 hour, 24 hours, 7 days) in `components/invocations`, shared by Observability and both invocation lists. Lists send it as `sinceMs`, rounded to the minute by `useInvocationsTimeframeSince` |
| Metrics | Never compute stats from a page of invocations in the browser |

## The layout of `ui/src`

```
src
├── host/        main · App · router · routes/ · api/ (transport, queryClient) · layouts/app/ (command palette)
├── module/      AlchemyLayout · paths · routes · schemas · hooks · commands · nav · types · constants · error/pending components
├── layouts/main MainLayout (DLS AppFrame) · MainLayoutSidebar
├── pages/       observability/ · functions/ (components/{card,header,contract,create}, overview/, workbench/, contract/, versions/, settings/) · invocations/ (components/drawer) · hosts/
├── components/  RouterLink · ListSearch · KeyValueList(Row) · RelativeTime · Stat · functions/FunctionName · invocations/ (status, start kind, phase bar, outcome, logs, empty state, filters, timeframe, table/ with `InvocationsTableVariant`, hooks/ useInvocationsFilters · useInvocationMetrics · useInvocationsTimeframeSince)
├── api/         utils · queries/{functions,function_versions,invocations,hosts,instances,metrics,constants}
├── hooks/       useConfirm · useOverlaySession
├── utils/       arrow · errors · format · json · select
└── gen/         generated from ../protos, never edited
```

## Gates

From `ui/`, with pnpm: `pnpm check` (typecheck, typecheck:lib, lint, format, build, build:lib, check:package, check:host), then `git diff --exit-code src/host/routeTree.gen.ts`. From the root, `just ui-check` runs all of it, as CI does.

Then run these from `ui/src`. Each prints nothing when the code is clean.

```bash
rg -n 'class\*="gx-' --glob '!gen/**' .
rg -n 'as never|as unknown as|@ts-ignore' --glob '!gen/**' --glob '!module/hooks.ts' .
rg -n '(^|\s)(//|/\*|\{/\*)' -g '*.{ts,tsx,css}' --glob '!gen/**' --glob '!**/routeTree.gen.ts' . | rg -v 'biome-ignore|https?://|"[^"]*//[^"]*"|`[^`]*//[^`]*`'
rg -n '^const [A-Z]\w* = memo\(|^(export )?(default )?function [A-Z]|React\.FC' -g '*.{ts,tsx}' --glob '!gen/**' .
rg -n 'BigInt\.prototype' --glob '!gen/**' .
rg -n 'useSearch\(|useParams\(|useNavigate\(' --glob '!host/**' --glob '!module/**' --glob '!gen/**' .
rg -n 'from: "/_app|to: "/' --glob '!host/**' --glob '!gen/**' .
rg -n '"\./(functions|invocations|hosts|observability)' --glob '!module/paths.ts' --glob '!host/**' --glob '!gen/**' .
for f in functions invocations hosts observability; do rg -n --pcre2 "from \"@/pages/(?!$f/)" "pages/$f"; done
rg -n 'from "@/pages/' api components layouts hooks utils
rg -n 'from "@/pages/[^"]*Page"' module/routes.tsx | rg -v 'FunctionNotFoundPage'
rg -n 'use(Layout)?Effect\(' -g '*.tsx' --glob '!gen/**' .
rg -n '^\s+[a-z-]+: [^$]*\b[0-9]+px' -g '*.tsx' --glob '!gen/**' .
rg -n '·' --glob '!gen/**' .
```

## Verify

`.agents/launch.json` names `alchemy-ui` (5173), `alchemy-ui-verify` (5175, its own Vite cache) and `alchemy-host-fixture` (5176, after `pnpm build:lib`). Verify against a real server (`just dev`), never a mock. Check Dark and Light, 1024px wide, every empty, filtered-empty, error and not-found state, and the URL after every interaction.

## Before you hand it over

- [ ] The screen copies an existing Alchemy shape and serves one of the core flows above.
- [ ] Every component is `FC`, one default export per file, feature prefix on every name, no barrels, no comments, no `useEffect` in `.tsx`.
- [ ] Types come from the protos, enum maps are exhaustive `Record`s in `constants.ts`, `UNSPECIFIED` handled by behaviour.
- [ ] View state is in the URL through `module/schemas.ts` and `module/hooks.ts`. No absolute paths in library code.
- [ ] Data goes through `src/api/queries`, invalidation lives in the mutation hook, overlays use plain queries.
- [ ] `pnpm check` passes, the greps print nothing, `src/host/routeTree.gen.ts` and `src/gen/` are committed.
