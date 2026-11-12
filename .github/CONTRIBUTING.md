# Contributing to Alchemy

Thanks for helping improve Alchemy. This guide explains how to set up the project, make a change, and open a pull request.

## Before you start

For a bug fix, open or link an issue that explains what happened and what you expected. For a large feature or architectural change, open a feature request before you start. This gives us time to agree on the approach.

By participating, you agree to follow our [Code of Conduct](../CODE_OF_CONDUCT.md).

Do not include credentials, customer data, production connection strings, or other secrets in issues, tests, fixtures, logs, or commits.

## Development setup

You will need:

- Go 1.26.4 or newer
- Docker with Compose
- `just`
- Node.js 22 and pnpm 12 for the UI and the docs
- `golangci-lint`, Buf, sqlc, `protoc-gen-go` and `protoc-gen-connect-go` for formatting, linting, and code generation
- Lima, and an Apple silicon Mac with an M3 or later on macOS 15 or later, to run hosts locally

On macOS, the repository's [`Brewfile`](../Brewfile) installs Go, `just`, Buf, `golangci-lint`, `jq`, the RustFS client and Lima:

```sh
brew bundle
```

Install the rest with your package manager. Then list the available tasks:

```sh
just --list
```

Firecracker needs KVM, so local hosts run in a Lima VM with nested virtualization. Start the local infrastructure, the VM and the runtime images, then run Alchemy:

```sh
just infra
just vm
just images
just dev
```

Open <http://localhost:5173> to use the UI. When you finish, run `just vm down` and `just infra down`. Run `just infra down volumes` if you also want to delete local data.

## Making a change

1. Fork the repository and clone your fork.
2. Create a focused branch from the latest `main`.
3. Add or update tests for behavior changes.
4. Regenerate checked-in artifacts when their sources change.
5. Run the relevant formatting, lint, build, and test commands.
6. Open a pull request to the upstream repository. Explain the problem, your approach, and how you tested the change.

Keep each pull request focused on one concern. Clearly note changes to the protobuf API, the HTTP invoke endpoint, datastore migrations, runtime images, or Helm values.

## Code generation

We commit generated API, datastore and UI client code. Do not edit it by hand.

| Changed source | Command | Generated output |
| --- | --- | --- |
| `protos/**/*.proto` | `just proto` | Go and ConnectRPC stubs in `api/` |
| `protos/**/*.proto` | `just ui-gen` | TypeScript clients in `ui/src/gen/` |
| `datastore/postgres/queries/*.sql`, `migrations/` or `sqlc.yaml` | `just sqlc` | PostgreSQL query code |
| Any of the above | `just gen` | All generated code |

Use `just proto-check` to confirm generated protobuf files are current. A new service also needs a proxy entry in `ui/vite.config.ts`.

## Tests and checks

Run the checks that apply to your change. Start with:

```sh
just format check
just lint check
just test
```

Useful targeted commands include:

```sh
just ui-check     # Type-check, lint and build the UI and the @galaxy-io/alchemy-ui module
just proto-lint   # Lint protobuf definitions
just binaries     # Build the server, host and supervisor
```

The Go tests are unit tests. They need no KVM, Docker, PostgreSQL or NATS. To see a change work end to end, run the stack with `just dev` and invoke a function, as in the [quickstart](https://alchemy.getgalaxy.io/pages/get-started/quickstart).

For a small change, you may run the narrowest relevant package or test. List the exact commands in your pull request.

## Docs changes

The documentation site lives in [`docs/`](../docs) and is built with Mintlify. Run it with `just docs`, and run `pnpm validate` and `pnpm check` from `docs/` before opening a pull request. Check every claim against the code.

## Pull requests

Pull request titles follow [Conventional Commits](https://www.conventionalcommits.org), such as `fix(host): bound microVM boots`. CI enforces this, and release-please uses the titles to version releases.

A pull request should include:

- A short description of the problem and why the change is needed
- The approach and any important tradeoffs
- Links to related issues
- Screenshots or recordings for UI changes
- Compatibility notes for API, configuration, or schema changes
- The commands used to test the change

Before requesting review, confirm that:

- Generated files are current
- Formatting, linting, and relevant tests pass
- Tests cover new behavior
- Documentation and examples are current
- The change contains no secrets or unrelated generated files

Rules in [`.github/CODEOWNERS`](CODEOWNERS) request the right reviewers automatically.

## Reporting bugs and proposing features

Use GitHub Issues for bugs and feature proposals. Search first to avoid duplicates. Include the use case, affected component, environment, and constraints. Remove all sensitive information.

Do not open a public issue for a security report. Follow the [security policy](../SECURITY.md) instead.
