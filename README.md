<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/alchemy-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/alchemy-light.svg">
  <img alt="Alchemy: fast, isolated, strongly typed compute functions" src=".github/assets/alchemy-light.svg" width="520">
</picture>

[![Release](https://img.shields.io/github/v/release/galaxy-io/alchemy?filter=v*)](https://github.com/galaxy-io/alchemy/releases)
[![Tests](https://github.com/galaxy-io/alchemy/actions/workflows/test.yaml/badge.svg)](https://github.com/galaxy-io/alchemy/actions/workflows/test.yaml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Ask DeepWiki](https://img.shields.io/badge/DeepWiki-Ask-7B3FE4)](https://deepwiki.com/galaxy-io/alchemy)
[![Slack](https://img.shields.io/badge/slack-join-4A154B?logo=slack&logoColor=white)](https://join.slack.com/t/galaxy-io-community/shared_invite/zt-45qln0zg5-9CTvKVXugvh3sEhpD6KzJQ)

</div>

# Alchemy

Alchemy is a runtime for fast, isolated, strongly typed compute functions.

It runs each invocation in a Firecracker microVM, checks every input and output against the function's contract, and records every call. A function is an OCI image or Python, TypeScript, Go or Rust source, plus a contract.

Run Alchemy as a service with its API and web UI, or deploy it to your own machines with KVM.

## Install

Install the Helm chart from GitHub Container Registry:

```sh
helm upgrade --install alchemy oci://ghcr.io/galaxy-io/charts/alchemy --set existingSecret=alchemy-runtime
```

See [Installation](https://alchemy.getgalaxy.io/pages/get-started/installation) for the images and how to verify a release.

## Getting started

To run Alchemy locally, install Go, Docker, `just`, Node.js, pnpm and Lima. On macOS, the repository's `Brewfile` installs Go, `just`, Lima, Buf and golangci-lint:

```sh
brew bundle
```

Firecracker needs KVM, so on macOS hosts run in a Lima VM with nested virtualization (Apple M3 or later, macOS 15 or later).

Start the infrastructure and the VM, build the runtime images, then run Alchemy:

```sh
just infra
just vm
just images
just dev
```

Open <http://localhost:5173> to use the web UI. The [quickstart](https://alchemy.getgalaxy.io/pages/get-started/quickstart) creates a function and invokes it.

When you are finished, stop the local infrastructure with:

```sh
just vm down
just infra down
```

## Deploying Alchemy

Kubernetes with Helm is the recommended way to run Alchemy in production. Hosts need `/dev/kvm`, so they run on bare metal or VMs with nested virtualization. See the [Kubernetes deployment guide](https://alchemy.getgalaxy.io/pages/deployment/kubernetes) and the [Helm chart README](charts/alchemy/README.md) for all supported values.

## How it works

Alchemy builds a function's image into a root filesystem once, boots it and snapshots the microVM. Invocations run in microVMs restored from that snapshot, which stay warm between calls. A contract, a JSON Schema or an Arrow schema, checks every input and output.

The server queues every invocation in NATS JetStream. Hosts take invocations whenever they have a free slot, so a busy fleet makes calls wait rather than fail. PostgreSQL stores functions, versions and finished invocations, and servers are stateless, so any number run side by side.

Call a function by POSTing its input to `/functions/<function-id>/invoke`. See [Call functions over HTTP](https://alchemy.getgalaxy.io/pages/usage/http) for retries, idempotency and async calls.

## Developing Alchemy

Alchemy is written in Go, with a React and TypeScript web UI. Contributions to the runtime, the UI, deployment tooling, tests and documentation are welcome.

See [Local development](https://alchemy.getgalaxy.io/pages/contributing/local-development) for setup, code generation and tests.

## Community

- Read the [Alchemy documentation](https://alchemy.getgalaxy.io).
- Ask questions and meet other users in the [Galaxy Slack community](https://join.slack.com/t/galaxy-io-community/shared_invite/zt-45qln0zg5-9CTvKVXugvh3sEhpD6KzJQ).
- Report bugs or propose features through [GitHub Issues](https://github.com/galaxy-io/alchemy/issues).
