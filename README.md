<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/alchemy-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/alchemy-light.svg">
  <img alt="Alchemy: fast, isolated, strongly typed compute functions" src=".github/assets/alchemy-light.svg" width="520">
</picture>

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

`?version=3` pins a version and an `Idempotency-Key` header makes the call safe to retry. The response names the invocation in `Alchemy-Invocation-Id` and the version that ran in `Alchemy-Version`. A failure answers with its HTTP status and a JSON body with `code` and `message`. A function that fails answers 500, or 504 when it timed out, with its error as JSON. With auth enabled, send `Authorization: Bearer <token>`. The same call is `FunctionsService.Invoke` on the API.

## Deploying Alchemy

Kubernetes with Helm is the recommended way to run Alchemy in production. Hosts need `/dev/kvm`, so they run on bare-metal nodes or on VMs with nested virtualization. The server runs anywhere. See the [Helm chart README](charts/alchemy/README.md) for preparing KVM nodes and for all supported values.

## How it works

A function is an OCI image plus a contract, a JSON Schema or an Arrow schema for its input and output. Alchemy builds the image into a root filesystem once, boots it once and snapshots the microVM, restores that snapshot per invocation, checks every input and output against the contract, and keeps every invocation's record and logs.

The server accepts functions and invocations over its API and places each function on a few hosts. Hosts own the KVM machines, build root filesystems and run the microVMs, and a supervisor inside each guest runs the function. PostgreSQL stores functions, versions and finished invocations, and NATS carries everything between servers and hosts, so any number of servers run side by side and the database is never on the invocation path.

## Developing Alchemy

Alchemy is written in Go, with a React and TypeScript web UI. Contributions to the runtime, the UI, deployment tooling, tests and documentation are welcome.

## Community

- Report bugs or propose features through [GitHub Issues](https://github.com/galaxy-io/alchemy/issues).
