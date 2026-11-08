# Alchemy Helm Chart

This chart deploys the Alchemy server and one host per KVM-capable node, plus the configuration that connects them to PostgreSQL and NATS.

- **server** is a Deployment behind one Service, sized by `server.replicas` or, with `server.autoscaling.enabled`, by a HorizontalPodAutoscaler on CPU. Any replica serves any request. Each applies migrations when it starts, one at a time under a PostgreSQL lock. Servers queue every invocation in a JetStream stream and wait for its result, for up to `server.invoke.deadline` when the caller sets no deadline. An async invocation waits for nothing and may stay queued, retries included, for `server.invoke.async.maxAge`.

Invocations are not written to PostgreSQL while they run. The host that ran one publishes its record to a JetStream stream when it ends, and the servers write records in batches, so the database is never on the invocation path.
- **host** is a Deployment of `host.replicas` hosts, one per node, on nodes matching `host.nodeSelector` (`alchemy.getgalaxy.io/kvm: "true"` by default). Each host takes invocations from the queue whenever it has a free slot, builds a function the first time it takes one of its invocations, and boots Firecracker microVMs on its node and pulls function images straight from their registries, with no container daemon. Pulls from ECR, Artifact Registry and GCR authenticate with the cloud's workload identity (IRSA or Pod Identity on AWS, Workload Identity on GCP). Other registries use the Docker config or are pulled anonymously.

## Host nodes

Hosts need `/dev/kvm`, so the nodes must be bare metal or VMs with nested virtualization enabled. Label them so hosts schedule there, and taint them so nothing else does:

```sh
kubectl label node <node> alchemy.getgalaxy.io/kvm=true
kubectl taint node <node> alchemy.getgalaxy.io/kvm=true:NoSchedule
```

Hosts tolerate that taint by default (`host.tolerations`).

Hosts run as privileged containers with the node's `/dev/kvm` mounted. Privilege is what isolates the microVMs: each one runs under Firecracker's jailer, chrooted into its own directory, in its own cgroup capped at its vCPUs, and as its own unprivileged uid. The node needs cgroup v2.

Guest memory and vCPUs count against the host pod. Set `host.resources.limits` to cover `host.memoryBudgetMiB` and the host process on top of it.

## Autoscaling hosts

With `host.autoscaling.enabled`, a [KEDA](https://keda.sh) `ScaledObject` sizes the host Deployment instead of `host.replicas`. KEDA must already be installed in the cluster.

KEDA reads `/scaling` on the server every `host.autoscaling.pollingInterval` seconds. Its `demand` is the slots busy across hosts plus the invocations waiting because every host is full. Hosts are set to `demand` divided by `host.autoscaling.targetUtilization` percent of `host.maxInstances`, between `minReplicas` and `maxReplicas`. With 8 slots at 75%, 24 slots of demand means 4 hosts.

Hosts are added straight away. They are removed one per minute once demand has stayed low for `scaleDownStabilizationSeconds`, and each drains its microVMs first.

A new host only runs once it has a KVM node. Run a node autoscaler such as Karpenter or Cluster Autoscaler on the KVM node pool, or pending hosts wait for a node indefinitely.

## Installing

Every release publishes the chart to `oci://ghcr.io/galaxy-io/charts/alchemy`, with server and host images of the same version under `ghcr.io/galaxy-io/alchemy`. The runtime images there carry their language version, such as `runtime/python:3.13`. The examples below install from a checkout. To install a release, use the OCI reference in place of `charts/alchemy`:

```sh
helm upgrade --install alchemy oci://ghcr.io/galaxy-io/charts/alchemy --set existingSecret=alchemy-runtime
```

Verify a release with `gh attestation verify --owner galaxy-io oci://ghcr.io/galaxy-io/charts/alchemy:<version>`. Without `--version`, Helm installs the newest release.

## Runtime configuration

Alchemy needs a PostgreSQL DSN, a NATS URL and an encryption key for tenant secrets, a base64 AES key the server encrypts them with before they reach PostgreSQL. NATS must accept 64MB messages (`max_payload: 64MB`) and have JetStream enabled with file storage, which keeps recent function logs and invocation records no server has written yet. You can supply all three through an existing Secret:

```sh
kubectl create secret generic alchemy-runtime \
  --from-literal=PERSISTENCE_DSN='postgresql://USER:PASSWORD@HOST:5432/alchemy?sslmode=require' \
  --from-literal=NATS_URL='nats://nats.example.com:4222' \
  --from-literal=ENCRYPTION_KEY="$(openssl rand -base64 32)"

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

Everything a function writes to stderr is kept. While an invocation runs, its host sends the log to NATS, which keeps the latest 10 MiB of every invocation for `functionLogs.retention` (1 hour by default) so the UI can follow it live. At the same time the host uploads the whole log to `functionLogs.bucket` as one gzipped object, `<tenant>/<function>/<YYYY>/<MM>/<DD>/<invocation>.log.gz` (the day the invocation was created, in UTC), which appears when the invocation ends. After that, logs are read from the bucket.

Point `functionLogs.bucket` at an S3 or GCS bucket. Hosts need to write to it and the server to read it, through their service accounts' cloud identity (`host.serviceAccount.annotations` and `server.serviceAccount.annotations`). Without a bucket, logs only last as long as NATS keeps them.

Older logs move to colder storage through the bucket's own lifecycle rules, not Alchemy. Add two:

- Transition objects to Glacier (S3) or Archive (GCS) after as long as you want logs to stay quick to read.
- Abort incomplete multipart uploads after a day. A host that dies mid-invocation leaves its upload incomplete, and S3 charges for the parts until it is aborted.

## Artifacts

A build can extract layers over a function's image: tar archives kept in `artifacts.bucket`, each checked against its digest. They are how a function built from source reaches its root filesystem: the server writes the function's files there as one archive, and the hosts that build the version read it. The server needs to write the bucket and hosts to read it, through their service accounts' cloud identity (`server.serviceAccount.annotations`, `host.serviceAccount.annotations`). Without a bucket, functions are built from images only.

## Runtimes

A function built from source lands on a runtime image, one per language, published under `runtimes.imagePrefix` as `<imagePrefix>/python:3.13` and so on. The server lists them to clients with their icons from `runtimes.iconBaseUrl`. Point `imagePrefix` at a registry of your own to serve the runtimes from there.

A version uses its layers for as long as it exists, so the bucket must not expire them. Keep it separate from `functionLogs.bucket`, whose lifecycle rules do.

## Images

Each command has its own Dockerfile under `cmd/`. `just images` builds both for this machine's architecture:

- `cmd/server/Dockerfile`: the server on distroless.
- `cmd/host/Dockerfile`: the host, Firecracker, a guest kernel and the supervisor. The host copies the supervisor into every function's root filesystem as init.
