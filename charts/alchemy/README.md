# Alchemy Helm Chart

This chart deploys the Alchemy server and one host per KVM-capable node, plus the configuration that connects them to PostgreSQL and NATS.

- **server** is a Deployment. It serves the API on port 8780 and applies migrations when it starts.
- **host** is a Deployment of `host.replicas` hosts, one per node, on nodes matching `host.nodeSelector` (`alchemy.getgalaxy.io/kvm: "true"` by default). Each host boots Firecracker microVMs on its node and pulls function images straight from their registries. No container daemon is involved.

> [!CAUTION]
> Keep `server.replicas` at `1`. Invocation state events are not yet shared between replicas.

## Host nodes

Hosts need `/dev/kvm`, so the nodes must be bare metal or VMs with nested virtualization enabled. Label them so hosts schedule there, and taint them so nothing else does:

```sh
kubectl label node <node> alchemy.getgalaxy.io/kvm=true
kubectl taint node <node> alchemy.getgalaxy.io/kvm=true:NoSchedule
```

Hosts tolerate that taint by default (`host.tolerations`).

Hosts run as privileged containers with the node's `/dev/kvm` mounted. Privilege is what isolates the microVMs: each one runs under Firecracker's jailer, chrooted into its own directory, in its own cgroup capped at its vCPUs, and as its own unprivileged uid. The node needs cgroup v2.

Guest memory and vCPUs count against the host pod. Set `host.resources.limits` to cover `host.memoryMiB` and the host process on top of it.

## Autoscaling hosts

With `host.autoscaling.enabled`, a [KEDA](https://keda.sh) `ScaledObject` sizes the host Deployment instead of `host.replicas`. KEDA must already be installed in the cluster.

KEDA reads `/scaling` on the server every `host.autoscaling.pollingInterval` seconds. Its `demand` is the slots busy across hosts plus the invocations waiting because every host is full. Hosts are set to `demand` divided by `host.autoscaling.targetUtilization` percent of `host.maxConcurrency`, between `minReplicas` and `maxReplicas`. With 8 slots at 75%, 24 slots of demand means 4 hosts.

Hosts are added straight away. They are removed one per minute once demand has stayed low for `scaleDownStabilizationSeconds`, and each drains its microVMs first.

A new host only runs once it has a KVM node. Run a node autoscaler such as Karpenter or Cluster Autoscaler on the KVM node pool, or pending hosts wait for a node indefinitely.

## Runtime configuration

Alchemy needs a PostgreSQL DSN and a NATS URL. NATS must accept 64MB messages (`max_payload: 64MB`) and have JetStream enabled with memory storage, which holds recent function logs. You can supply both through an existing Secret:

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

The vendored NATS is already set to `max_payload: 64MB` with JetStream in memory. Every value is documented in [values.yaml](values.yaml).

## Function logs

Everything a function writes to stderr is kept. While an invocation runs, its host sends the log to NATS, which keeps the latest 10 MiB of every invocation for `functionLogs.retention` (1 hour by default) so the UI can follow it live. At the same time the host uploads the whole log to `functionLogs.bucket` as one gzipped object, `<tenant>/<invocation>.log.gz`, which appears when the invocation ends. After that, logs are read from the bucket.

Point `functionLogs.bucket` at an S3 or GCS bucket. Hosts need to write to it and the server to read it, through their service accounts' cloud identity (`host.serviceAccount.annotations` and `server.serviceAccount.annotations`). Without a bucket, logs only last as long as NATS keeps them.

Older logs move to colder storage through the bucket's own lifecycle rules, not Alchemy. Add two:

- Transition objects to Glacier (S3) or Archive (GCS) after as long as you want logs to stay quick to read.
- Abort incomplete multipart uploads after a day. A host that dies mid-invocation leaves its upload incomplete, and S3 charges for the parts until it is aborted.

## Images

Each command has its own Dockerfile under `cmd/`. `just images` builds both for this machine's architecture:

- `cmd/server/Dockerfile`: the server on distroless.
- `cmd/host/Dockerfile`: the host, Firecracker, a guest kernel and the supervisor. The host copies the supervisor into every function's root filesystem as init.
