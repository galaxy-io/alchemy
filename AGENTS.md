# Alchemy: agent guide

Alchemy is a runtime for fast, isolated, strongly typed compute functions: a Go control plane (`cmd/server`, `internal/server`), a KVM host (`cmd/host`) and an in-VM supervisor (`cmd/supervisor`), a protobuf API (`protos/`, `api/`) and a React web UI (`ui/`). The code is the source of truth.

## Skills

The repository ships its conventions as skills under `.agents/skills/` (`.claude` is a symlink to `.agents`, so Claude Code loads them automatically).

| Skill | Use it when |
|---|---|
| `alchemy-ui` | Anything under `ui/`. Screens, routes, search params, query hooks, forms, tables, dashboards, overlays, styling with `@galaxy-io/dls`, reviewing UI. |

## UI

All work in `ui/` follows the `alchemy-ui` skill, loaded with the org's `galaxy-ui` skill for the Galaxy app architecture and the design system.

- React 18, Vite, TanStack Router, ConnectRPC through `@connectrpc/connect-query`, Linaria and `@galaxy-io/dls`: the Galaxy app stack.
- One source tree builds the standalone app (`pnpm build` → `ui/build/`) and the mountable `@galaxy-io/alchemy-ui` module (`pnpm build:lib` → `ui/dist/`). Standalone-only code lives in `ui/src/host/`, the module's surface in `ui/src/module/`, the package exports in `ui/package.json`. `ui/fixtures/host/` is the reference host.
- Protos drive the UI's types. After a proto change run `cd ui && pnpm codegen` and commit `ui/src/gen/`. A new service needs a proxy entry in `ui/vite.config.ts`.
- The server embeds `ui/build` when built with `-tags embedui` (`just binaries`); without the tag `ui.Handler()` serves a placeholder, so `go build ./...` needs no Node.
- `@galaxy-io/alchemy-ui` ships to npm through release-please (`alchemy-ui` component) and `.github/workflows/ui-release.yaml`.
- Gates: `just ui-check` (or `pnpm check` plus the route-tree diff from `ui/`).

## CLI

- `cmd/alchemy` is the CLI, built the way filament's is: cobra commands over the generated Go client, with the shared pieces (`style`, `text`, `interactive`, `contexts`, `auth`, `settings`, `configfile`) under `cmd/internal/cli`. `alchemy -i` opens the interactive menus, drawn with `dado`. It ships through GoReleaser (`.goreleaser.yaml`, `.github/workflows/cli.yaml`) on every `v*` release, with a cask in `galaxy-io/homebrew-tap`.
