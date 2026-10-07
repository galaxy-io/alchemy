# Alchemy

Alchemy is a runtime for fast, isolated, strongly typed compute functions.

It runs each invocation in its own Firecracker microVM, checks every input and output against the function's contract, and records the full lifecycle of every call. A function is an OCI image plus a contract; Alchemy builds it into a root filesystem once and boots it on demand.

Run Alchemy as a service with its API and web UI, or deploy it to your own machines with KVM.

## Getting started

To run Alchemy locally, install Go, Docker, `just`, Node.js, pnpm, and Lima. On macOS, the repository's `Brewfile` installs the toolchain:

```sh
brew bundle
```

Firecracker needs KVM, which Docker Desktop does not provide. On macOS the KVM host is a Lima VM with nested virtualization (Apple M3 or later, macOS 15 or later); `just vm` creates it on first run.

Start PostgreSQL and NATS, start the VM, then run Alchemy:

```sh
just infra
just vm
just dev
```

Open <http://localhost:5173> to use the web UI. `just example` builds the example functions and `just demo` registers and invokes them.

When you are finished, stop the local infrastructure with:

```sh
just vm down
just infra down
```
