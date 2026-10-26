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

Start PostgreSQL and NATS, start the VM, then run Alchemy:

```sh
just infra
just vm
just dev
```

Open <http://localhost:5173> to use the web UI.

When you are finished, stop the local infrastructure with:

```sh
just vm down
just infra down
```

## Deploying Alchemy

Kubernetes with Helm is the recommended way to run Alchemy in production. Hosts need `/dev/kvm`, so they run on bare-metal nodes or on VMs with nested virtualization. The server runs anywhere. See the [Helm chart README](charts/alchemy/README.md) for preparing KVM nodes and for all supported values.

Hosts pull function images straight from their registries, with no container daemon. Pulls from ECR, Artifact Registry and GCR authenticate with the cloud's workload identity (IRSA or Pod Identity on AWS, Workload Identity on GCP). Other registries use the Docker config or are pulled anonymously.

## How it works

A function is an OCI image plus a contract. The contract describes the function's input and output as a JSON Schema or an Arrow schema, and Alchemy checks every invocation against it on the way in and on the way out.

The server accepts functions and invocations over its API, stores functions and versions in PostgreSQL, and dispatches work to hosts over NATS. Any number of servers run side by side. Nothing is written about an invocation while it runs: the host that ran it publishes its record when it ends, and the servers write records to PostgreSQL in batches, so the database is never on the invocation path. Each host owns one KVM machine: it flattens a function's image into a read-only root filesystem once, cached by digest, then boots a Firecracker microVM per invocation. Inside the guest, the supervisor runs as init, receives the input over vsock, runs the function and returns its output.

Everything a function writes to stderr is kept. The UI follows it live while the function runs, and each invocation's full log goes to an S3 or GCS bucket when it ends.

Finished microVMs stay booted for a while so the next invocation of the same function starts warm, and hosts can keep instances booted before any invocation arrives.

Every microVM runs under Firecracker's jailer. It is chrooted into a directory holding only its kernel and root filesystem, placed in a cgroup capped at its vCPUs, and run as a uid no other microVM shares. A guest that escapes the VM lands in a process that can reach nothing else on the host. The host itself runs as root to set this up.

## Developing Alchemy

Alchemy is written in Go, with a React and TypeScript web UI. Contributions to the runtime, the UI, deployment tooling, tests and documentation are welcome.

## Community

- Report bugs or propose features through [GitHub Issues](https://github.com/galaxy-io/alchemy/issues).
