# Alchemy Helm Chart

This chart deploys the Alchemy server and one host per KVM-capable node, plus the configuration that connects them to PostgreSQL and NATS.

- **server** is a Deployment. It serves the API on port 8780 and applies migrations when it starts.
- **host** is a Deployment of `host.replicas` hosts, one per node, on nodes matching `host.nodeSelector` (`alchemy.galaxy.io/kvm: "true"` by default). Each host boots Firecracker microVMs on its node and pulls function images straight from their registries. No container daemon is involved.

> [!CAUTION]
> Keep `server.replicas` at `1`. Invocation state events are not yet shared between replicas.

## Host nodes

Hosts need `/dev/kvm`, so the nodes must be bare metal or VMs with nested virtualization enabled. Label them so hosts schedule there, and taint them so nothing else does:

```sh
kubectl label node <node> alchemy.galaxy.io/kvm=true
kubectl taint node <node> alchemy.galaxy.io/kvm=true:NoSchedule
```

Hosts tolerate that taint by default (`host.tolerations`).

`host.kvm.mode` controls how the host reaches the device:

- `privileged` (default) mounts the node's `/dev/kvm` into a privileged container.
- `devicePlugin` requests `host.kvm.resourceName` (default `devices.kubevirt.io/kvm`) from a KVM device plugin. The container runs unprivileged.

Guest memory and vCPUs count against the host pod. Set `host.resources.limits` to cover `host.memoryMiB` and the host process on top of it.

## Runtime configuration

Alchemy needs a PostgreSQL DSN and a NATS URL. NATS must accept 64MB messages (`max_payload: 64MB`). You can supply both through an existing Secret:

```sh
kubectl create secret generic alchemy-runtime \
  --from-literal=PERSISTENCE_DSN='postgresql://USER:PASSWORD@HOST:5432/alchemy?sslmode=require' \
  --from-literal=NATS_URL='nats://nats.example.com:4222'

helm upgrade --install alchemy charts/alchemy --set existingSecret=alchemy-runtime
```

For a local or test cluster, use the vendored PostgreSQL and NATS charts instead:

```sh
helm dependency build charts/alchemy
PG_PASSWORD="$(openssl rand -hex 24)"

helm upgrade --install alchemy charts/alchemy \
  --set postgresql.enabled=true \
  --set nats.enabled=true \
  --set-string postgresql.auth.password="$PG_PASSWORD" \
  --set-string persistence.postgresql.dsn="postgresql://alchemy:${PG_PASSWORD}@alchemy-postgresql:5432/alchemy?sslmode=disable" \
  --set-string eventBus.nats.url='nats://alchemy-nats:4222'
```

The vendored NATS is already set to `max_payload: 64MB`. Every value is documented in [values.yaml](values.yaml).

## Images

Each command has its own Dockerfile under `cmd/`. `just images` builds both for this machine's architecture:

- `cmd/server/Dockerfile`: the server on distroless.
- `cmd/host/Dockerfile`: the host, Firecracker, a guest kernel and the supervisor. The host copies the supervisor into every function's root filesystem as init.
