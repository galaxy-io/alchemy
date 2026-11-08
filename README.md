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

It runs each invocation in its own Firecracker microVM, checks every input and output against the function's contract, and records the full lifecycle of every call. A function is an OCI image plus a contract. Alchemy builds it into a root filesystem once and boots it on demand.

Run Alchemy as a service with its API and web UI, or deploy it to your own machines with KVM.

## Getting started

To run Alchemy locally, install Go, Docker, `just`, Node.js, pnpm, and Lima. On macOS, the repository's `Brewfile` installs the toolchain:

```sh
brew bundle
```

Firecracker needs KVM, which Docker Desktop does not provide. On macOS the KVM host is a Lima VM with nested virtualization (Apple M3 or later, macOS 15 or later), and `just vm` creates it on first run.

Start PostgreSQL, NATS, RustFS, the object store for logs and artifacts, and a registry for the runtime images, then start the VM, build the images and run Alchemy:

```sh
just infra
just vm
just images
just dev
```

Open <http://localhost:5173> to use the web UI.

When you are finished, stop the local infrastructure with:

```sh
just vm down
just infra down
```

## Writing a function

A function is an OCI image whose entrypoint reads its input on stdin and writes its output on stdout. Alchemy publishes a runtime image per language with the interpreter and the Arrow library in it, so a function in Python or TypeScript is a handler and a two line Dockerfile:

```Dockerfile
FROM ghcr.io/galaxy-io/alchemy/runtime/python:3.13
COPY handler.py /app/
```

The runtimes are `runtime/python:3.13`, `runtime/node:24` and `runtime/static:13`, a distroless Debian 13 for a function that compiles to one static binary, as the [Go and Rust examples](examples/embed) do. They are built from [`runtimes/`](runtimes). Any other image whose entrypoint speaks stdin and stdout works too.

A function on a runtime image needs no image of its own. A version whose spec carries `source` files, such as `handler.py`, is built from them: Alchemy keeps the files in its artifacts bucket and lays them over the runtime at `/app`. The files can use the standard library and the Arrow library the runtime ships, nothing is installed.

## Calling a function

POST a function's input to `/functions/<function-id>/invoke` on the server with the content type its contract takes, `application/json` or `application/vnd.apache.arrow.stream`, and the response body is its output:

```sh
curl localhost:8780/functions/<function-id>/invoke -H 'Content-Type: application/json' -d '{"id":"abc"}'
```

When every host is busy the call waits in the queue, for up to 5 minutes or the deadline the caller sets, and a function's `max_concurrency` caps how many of its calls run at once. `?version=3` pins a version and an `Idempotency-Key` header makes the call safe to retry. The response names the invocation in `Alchemy-Invocation-Id` and the version that ran in `Alchemy-Version`. A failure answers with its HTTP status and a JSON body with `code` and `message`. A function that fails answers 500, or 504 when it timed out, with its error as JSON. With auth enabled, send `Authorization: Bearer <token>`. The same call is `FunctionsService.Invoke` on the API.

A call whose function raises, crashes or times out, or that the platform cannot run, runs again up to the function's `retries`, 2 by default, after 1s, then 5s, then 25s and so on up to 5 minutes, while its deadline leaves room for another run. An `Alchemy-Retries` header sets a call's own, and `Alchemy-Attempts` answers how many runs the result took. One whose input breaks the contract never runs again.

Add `Prefer: respond-async` and the call returns at once with 202, the invocation id in the body and `Location: /invocations/<id>`. Nothing waits for it and its output is dropped, but its status, error, attempts and logs are recorded. It retries the same way, and may wait in the queue for up to 24 hours. An `Idempotency-Key` seen before returns the invocation it queued. The same call is `FunctionsService.InvokeAsync` on the API.

## Deploying Alchemy

Kubernetes with Helm is the recommended way to run Alchemy in production. Hosts need `/dev/kvm`, so they run on bare-metal nodes or on VMs with nested virtualization. The server runs anywhere. See the [Helm chart README](charts/alchemy/README.md) for preparing KVM nodes and for all supported values.

## How it works

A function is an OCI image plus a contract, a JSON Schema or an Arrow schema for its input and output. Alchemy builds the image into a root filesystem once, boots it once and snapshots the microVM, restores that snapshot per invocation, checks every input and output against the contract, and keeps every invocation's record and logs.

The server accepts functions and invocations over its API and queues every invocation in a NATS JetStream stream. Hosts own the KVM machines and take invocations from the queue whenever they have a free slot, so a busy fleet makes calls wait rather than fail. A host builds a function's root filesystem the first time it takes one of its invocations, and a supervisor inside each guest runs the function. PostgreSQL stores functions, versions and finished invocations, and NATS carries everything between servers and hosts, so any number of servers run side by side and the database is never on the invocation path.

## Developing Alchemy

Alchemy is written in Go, with a React and TypeScript web UI. Contributions to the runtime, the UI, deployment tooling, tests and documentation are welcome.

## Community

- Report bugs or propose features through [GitHub Issues](https://github.com/galaxy-io/alchemy/issues).
