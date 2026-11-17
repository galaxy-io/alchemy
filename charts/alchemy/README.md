# Alchemy Helm Chart

![Chart](https://img.shields.io/github/v/tag/galaxy-io/alchemy?filter=helm-chart-*&label=chart)
![App](https://img.shields.io/github/v/tag/galaxy-io/alchemy?filter=v*&sort=semver&label=app)

This chart deploys the Alchemy server and one host per KVM-capable node, plus the configuration that connects them to PostgreSQL and NATS.

- **server** is a Deployment behind one Service, sized by `server.replicas` or, with `server.autoscaling.enabled`, by a HorizontalPodAutoscaler on CPU. Any replica serves any request. A hook Job applies migrations once per install or upgrade (`persistence.migrate`). Servers queue every invocation in a JetStream stream and wait for its result, for up to `server.invoke.deadline` when the caller sets no deadline. An async invocation waits for nothing and may stay queued, retries included, for `server.invoke.async.maxAge`.

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

Every release publishes the chart to `oci://ghcr.io/galaxy-io/charts/alchemy`, with server and host images of the same version under `ghcr.io/galaxy-io/alchemy`. The runtime images there are published apart from releases, whenever one changes, and carry their language version, such as `runtime/python:3.13`. The examples below install from a checkout. To install a release, use the OCI reference in place of `charts/alchemy`:

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

The vendored NATS is already set to `max_payload: 64MB` with JetStream in memory. Every value is listed under the parameters below.

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

## Optional Requirements

| Repository | Name | Version |
|------------|------|---------|
| https://charts.bitnami.com/bitnami | postgresql | 18.7.11 |
| https://nats-io.github.io/k8s/helm/charts | nats | 2.14.2 |

The vendored PostgreSQL and NATS charts are disabled by default. See the [Bitnami PostgreSQL chart](https://artifacthub.io/packages/helm/bitnami/postgresql) and [NATS chart](https://artifacthub.io/packages/helm/nats/nats) documentation for their full configuration surfaces.

## Overrides

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| fullnameOverride | string | `""` | String to fully override the generated release name. |
| nameOverride | string | `""` | Provide a name in place of `alchemy`. |
| namespaceOverride | string | `""` | Override the namespace used in rendered manifests. |

## Common parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| commonLabels | object | `{}` | Labels added to all Alchemy resources. |
| existingSecret | string | `""` | Existing runtime Secret with `PERSISTENCE_DSN` and `NATS_URL`, plus `ENCRYPTION_KEY` and the `auth` credentials when they are used. The server reads all of it; hosts read only `NATS_URL`. |
| podLabels | object | `{}` | Labels added to the server and host pods. |

## Galaxy product parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| galaxy.productUrls | object | `{"alchemy":"","filament":""}` | Where each Galaxy product's UI is served, e.g. `alchemy: https://alchemy.example.com` (`GALAXY_<PRODUCT>_URL`). Products link to each other through these and send people back only to them. Set the same block on every product. |

## Server parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| server.affinity | object | `{}` | Affinity for the server. |
| server.autoscaling.enabled | bool | `false` | Scale servers with a HorizontalPodAutoscaler on CPU. Needs `server.resources.requests.cpu`. |
| server.autoscaling.maxReplicas | int | `5` | Most servers. |
| server.autoscaling.minReplicas | int | `1` | Fewest servers. |
| server.autoscaling.targetCPUUtilizationPercentage | int | `70` | Average CPU, as a percent of the request, to hold the servers at. |
| server.idempotencyWindow | string | `"24h"` | How long an invoke's idempotency key keeps a retry with the same key from running the function again. |
| server.image.pullPolicy | string | `"IfNotPresent"` | Server image pull policy. |
| server.image.pullSecrets | list | `[]` | Image pull secrets for the server Deployment. |
| server.image.repository | string | `"ghcr.io/galaxy-io/alchemy/server"` | Server image repository. |
| server.image.tag | string | `""` (defaults to chart appVersion) | Server image tag. |
| server.ingress.annotations | object | `{}` | Annotations for the Ingress, e.g. a cert-manager issuer or ALB settings. |
| server.ingress.className | string | `""` | IngressClass name, e.g. `nginx` or `alb`. Empty uses the cluster default. |
| server.ingress.enabled | bool | `false` | Enable an Ingress for the server API. |
| server.ingress.hosts | list | `["alchemy.example.com"]` | Hostnames served by the Ingress. |
| server.ingress.path | string | `"/"` | Path served by the Ingress. |
| server.ingress.pathType | string | `"Prefix"` | PathType for the path. |
| server.ingress.tls | list | `[]` | Ingress TLS configuration, passed through verbatim. |
| server.invocationStream.replicas | int | `1` | How many NATS servers keep each unwritten record. |
| server.invocationStream.retention | string | `"24h"` | How long NATS keeps an invocation record no server has written to PostgreSQL yet. |
| server.invoke.async.maxAge | string | `"24h"` | How long an async invocation may wait in the queue and between its attempts before it is recorded canceled. The queue keeps invocations this long plus a margin. |
| server.invoke.deadline | string | `"5m"` | How long a call waits for its result, queued and running, when the caller sets no deadline of its own. |
| server.invoke.maxDeadline | string | `"1h"` | The longest deadline a caller may set, and how long the queue keeps an invocation no host has taken. |
| server.invoke.queueReplicas | int | `1` | How many NATS servers keep each queued invocation. |
| server.invoke.retryBackoff | string | `"1s"` | How long an invocation waits after its first failed attempt. Each later wait is five times longer. |
| server.invoke.retryBackoffMax | string | `"5m"` | The longest wait between two attempts. |
| server.logFormat | string | `"json"` | Server log format: `json` or `text`. |
| server.logLevel | string | `"info"` | Server log level: `debug`, `info`, `warn` or `error`. |
| server.nodeSelector | object | `{}` | Node selector for the server. It needs no KVM and can run anywhere. |
| server.podDisruptionBudget.enabled | bool | `true` | Keep a PodDisruptionBudget for the server. |
| server.podDisruptionBudget.minAvailable | int | `1` | Server pods that must stay up through voluntary disruptions such as node drains. With one replica a drain waits for it, so the budget only applies when there is more than one replica or autoscaling is on. |
| server.replicas | int | `1` | Number of server replicas when `server.autoscaling.enabled` is false. Any replica serves any request. |
| server.resources | object | `{}` (See [values.yaml]) | Server resource requests and limits. |
| server.service.annotations | object | `{}` | Annotations for the Service, e.g. cloud load balancer settings. |
| server.service.port | int | `8780` | Server service and container port. |
| server.service.type | string | `"ClusterIP"` | Service type. |
| server.serviceAccount.annotations | object | `{}` | Annotations for the chart-created server ServiceAccount, e.g. an IRSA role ARN. |
| server.serviceAccount.name | string | `""` | Existing ServiceAccount name for the server. When set, the chart does not create one. |
| server.tolerations | list | `[]` | Tolerations for the server. |

## Host parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| host.affinity | object | `{}` | Affinity for hosts, merged with the built-in anti-affinity that keeps one host per node. |
| host.autoscaling.enabled | bool | `false` | Scale hosts with KEDA on slot demand: busy slots plus invocations waiting for one, read from the server's `/scaling`. Requires KEDA. |
| host.autoscaling.maxReplicas | int | `10` | Most hosts. |
| host.autoscaling.minReplicas | int | `1` | Fewest hosts. Keep at least 1: a new KVM node takes minutes. |
| host.autoscaling.pollingInterval | int | `15` | Seconds between KEDA's reads of `/scaling`. |
| host.autoscaling.scaleDownStabilizationSeconds | int | `300` | Seconds demand must stay low before hosts are removed. |
| host.autoscaling.targetUtilization | int | `75` | Percent of each host's `maxInstances` to keep busy. Lower leaves more headroom for bursts. |
| host.console.enabled | bool | `false` | Keep the guest serial console on (`CONSOLE_ENABLED`). Observable, slower boot. |
| host.data.sizeLimit | string | `""` | Size limit for the `emptyDir` holding the kernel, the rootfs cache and microVM jails. Empty means no limit. |
| host.egress.deny | list | `[]` | Ranges guests can never reach, on top of the private, link-local and reserved ones (`EGRESS_DENY`). Add cluster ranges outside those. |
| host.egress.dns | list | `["1.1.1.1","8.8.8.8"]` | One or two resolvers guests use (`EGRESS_DNS`). Must be outside the denied ranges. |
| host.egress.subnet | string | `"169.254.200.0/21"` | Host-local range each microVM with `network: EGRESS` takes a /30 of (`EGRESS_SUBNET`). It must not overlap anything the host reaches. |
| host.eviction.keptVersions | int | `2` | Newest versions of each function a host keeps built whatever their use (`KEPT_VERSIONS`). |
| host.eviction.versionIdleTTL | string | `"24h"` | How long an older version goes without an invocation before the host drops its snapshot and drives (`VERSION_IDLE_TTL`). `0s` keeps every version. |
| host.image.pullPolicy | string | `"IfNotPresent"` | Host image pull policy. |
| host.image.pullSecrets | list | `[]` | Image pull secrets for the host Deployment. |
| host.image.repository | string | `"ghcr.io/galaxy-io/alchemy/host"` | Host image repository. The image carries Firecracker, the guest kernel and the supervisor. |
| host.image.tag | string | `""` (defaults to chart appVersion) | Host image tag. |
| host.logFormat | string | `"json"` | Host log format: `json` or `text`. |
| host.logLevel | string | `"info"` | Host log level: `debug`, `info`, `warn` or `error`. |
| host.maxInstances | int | `8` | Instances a host runs at once, busy and warm together (`MAX_INSTANCES`). |
| host.maxUnavailable | int | `1` | Hosts replaced at a time during a rolling update. |
| host.memoryBudgetMiB | int | `0` | Guest memory in MiB the host may commit across its instances (`MEMORY_BUDGET_MIB`). 0 means no limit. Guest memory is charged to the host pod, so `resources.limits.memory` must leave room for it. When set and `resources` names no memory request or limit, it is the pod's memory request. |
| host.nodeSelector | object | `{"alchemy.getgalaxy.io/kvm":"true"}` | Nodes that run a host. They must expose `/dev/kvm`: bare metal, or virtual machines with nested virtualization enabled. |
| host.prewarmCount | int | `0` | Idle instances kept booted per function before any invocation arrives (`PREWARM_COUNT`). |
| host.registryAllow | list | `[]` | Registries function images may come from (`REGISTRY_ALLOW`), as hosts with optional `*` wildcards, such as `ghcr.io` or `*.dkr.ecr.*.amazonaws.com`. Docker Hub is `index.docker.io`. Empty allows any, which lets an image reference make a host fetch from any address it reaches. |
| host.replicas | int | `1` | Number of hosts. Each runs on its own node; on an autoscaled cluster, raising this is what brings up more KVM nodes. Ignored when `host.autoscaling.enabled` is true. |
| host.resources | object | `{}` (See [values.yaml]) | Host resource requests and limits. Size these for the microVMs, not the host process: guest memory and vCPUs are charged to this pod. |
| host.secretsRefreshInterval | string | `"5m"` | How long a host uses a fetched secret value before asking a server for it again (`SECRETS_REFRESH_INTERVAL`). A rotated secret reaches functions within this. |
| host.serviceAccount.annotations | object | `{}` | Annotations for the chart-created host ServiceAccount. |
| host.serviceAccount.name | string | `""` | Existing ServiceAccount name for hosts. When set, the chart does not create one. |
| host.snapshots.enabled | bool | `true` | Snapshot every version after its build and restore it per invocation instead of booting a kernel (`SNAPSHOTS_ENABLED`). |
| host.terminationGracePeriodSeconds | int | `60` | Seconds a host gets to stop its microVMs on shutdown. |
| host.tolerations | list | `[{"effect":"NoSchedule","key":"alchemy.getgalaxy.io/kvm","operator":"Equal","value":"true"}]` | Tolerations for hosts. The default tolerates the taint that keeps everything else off KVM nodes: `alchemy.getgalaxy.io/kvm=true:NoSchedule`. |
| host.warmInstanceTTL | string | `"5m"` | How long a finished instance stays booted for the next invocation (`WARM_INSTANCE_TTL`). `0s` starts every invocation afresh. |

## Persistence parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| persistence.migrate | bool | `true` | Run database migrations as a hook Job: pre-install/pre-upgrade when `existingSecret` is set and the vendored PostgreSQL is off, otherwise post-install/post-upgrade. |
| persistence.migrateResources | object | `{}` | Migration Job resource requests and limits. |
| persistence.postgresql.dsn | string | required | PostgreSQL connection string stored in the chart-created Secret as `PERSISTENCE_DSN`. Required unless `existingSecret` is set. |

## Secret provider parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| secrets.aws.region | string | `""` | AWS region for Secrets Manager (`AWS_REGION`). Leave empty to use the SDK default chain. |
| secrets.datastore.encryptionKey | string | `""` | Base64 AES key the server encrypts tenant secrets with before storing them in PostgreSQL, kept in the chart-created Secret as `ENCRYPTION_KEY`. Required for the secrets API unless `existingSecret` carries it; without it the API is off. |
| secrets.datastore.encryptionKeyId | string | `""` | Id stored with each secret for the key that encrypted it (`ENCRYPTION_KEY_ID`). Change it when rotating the key. |
| secrets.gcp.projectId | string | `""` | GCP project holding Secret Manager secrets (`GCP_PROJECT_ID`). Required when `secrets.type` is `gcp-secret-manager`. |
| secrets.gcp.region | string | `""` | GCP region holding Secret Manager secrets (`GCP_REGION`). Required when `secrets.type` is `gcp-secret-manager`. |
| secrets.prefix | string | `""` | Root name external secret stores give every secret (`SECRETS_PREFIX`). Defaults to `alchemy`: AWS names secrets `alchemy/<tenant>/...` and GCP `alchemy-<hash>`, and a prefix replaces that word. Unused by datastore. |
| secrets.type | string | `"datastore"` | Secret storage provider: `datastore`, `aws-secrets-manager` or `gcp-secret-manager`. `datastore` keeps secrets in PostgreSQL and emits no `SECRET_PROVIDER`. The others use the SDK's default credentials, such as the server's IRSA role or workload identity. |

## Event bus parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| eventBus.nats.url | string | required | NATS connection URL stored in the chart-created Secret as `NATS_URL`. Required unless `existingSecret` is set. The server must allow 64MB payloads (`max_payload`), since messages carry whole function inputs and outputs, and have JetStream enabled with memory storage for function logs. |

## Function log parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| functionLogs.bucket | string | `""` | Bucket every invocation's full log is uploaded to, as a gzipped object per invocation: `s3://BUCKET?region=REGION` or `gs://BUCKET`. Hosts need write access and the server read access, through the service accounts' cloud identity. Empty keeps logs on NATS only, for `retention`. |
| functionLogs.maxBytes | int | `1073741824` | Memory NATS may use for function logs across all invocations. The oldest lines go first, and are already in the bucket. |
| functionLogs.retention | string | `"1h"` | How long NATS keeps the latest lines of every invocation's log, for live and recent reads. |

## Artifact parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| artifacts.bucket | string | `""` | Bucket of the layers builds extract over an image, such as the files of a function built from source: `s3://BUCKET?region=REGION` or `gs://BUCKET`. The server needs write access and hosts read access, through the service accounts' cloud identity. Layers must outlive every version that uses them, so give it no expiry rule. Empty means functions are built from images only. |

## Runtime parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| runtimes.iconBaseUrl | string | `"https://cdn.getgalaxy.io/sources"` | Where the runtimes' icons are served from, as `<iconBaseUrl>/source-icon-<runtime>-<dark|light>.svg`. |
| runtimes.imagePrefix | string | `"ghcr.io/galaxy-io/alchemy/runtime"` | Registry prefix of the runtime images functions built from source land on: a runtime's image is `<imagePrefix>/python:3.13`. |

## Authentication parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| auth.bootstrap.adminEmail | string | `""` | Person who administers the tenant (`AUTH_BOOTSTRAP_ADMIN_EMAIL`), created on boot with `adminPassword` and left alone once it exists. Closes sign-up: people join by invitation. |
| auth.bootstrap.adminPassword | string | `""` | That person's initial password, kept in the chart-created Secret as `AUTH_BOOTSTRAP_ADMIN_PASSWORD`. With `existingSecret`, supply it there. |
| auth.bootstrap.tenant | string | `""` | Tenant converged on every boot (`AUTH_BOOTSTRAP_TENANT`). |
| auth.enabled | bool | `false` | Enable authentication. Disabled leaves the API unauthenticated and every request in the default tenant. |
| auth.keycloak.adminPassword | string | `""` | Master-realm admin password, kept in the chart-created Secret as `AUTH_ADMIN_PASSWORD`. |
| auth.keycloak.adminUser | string | `""` | Master-realm admin (`AUTH_ADMIN_USERNAME`). With `adminPassword` the server creates the realm and client on boot. |
| auth.keycloak.bootstrap.clientId | string | `""` | Admin service account on `auth.bootstrap.tenant`, so an SDK works before anyone signs in (`AUTH_BOOTSTRAP_CLIENT_ID`). Set with `clientSecret` or not at all. |
| auth.keycloak.bootstrap.clientSecret | string | `""` | Its secret, kept in the chart-created Secret as `AUTH_BOOTSTRAP_CLIENT_SECRET`. |
| auth.keycloak.clientId | string | `"alchemy"` | Alchemy's confidential client (`AUTH_CLIENT_ID`). |
| auth.keycloak.clientSecret | string | `""` | The client's secret, kept in the chart-created Secret as `AUTH_CLIENT_SECRET`. With `existingSecret`, supply it there. |
| auth.keycloak.issuer | string | required when `auth.type=keycloak` | Realm URL, `https://<host>/realms/<realm>` (`AUTH_ISSUER`). Must match what the realm advertises. Keycloak 26 or newer. |
| auth.proxy.tenant | string | `""` | The one gateway tenant this deployment serves (`AUTH_PROXY_TENANT`). Empty accepts any tenant the gateway names. |
| auth.type | string | `"keycloak"` | Identity provider: `keycloak`, `zitadel` or `proxy`. `proxy` trusts identity headers from a gateway that signs people in. |
| auth.uiOrigin | string | `""` | Origin the UI is served from (`AUTH_UI_ORIGIN`), normally the ingress host. An https origin marks the session cookie Secure. |
| auth.zitadel.issuer | string | required when `auth.type=zitadel` | Zitadel base URL (`AUTH_ISSUER`). Must equal the issuer Zitadel advertises. |
| auth.zitadel.pat | string | `""` | Machine-user personal access token with instance rights, kept in the chart-created Secret as `AUTH_PAT`. With `existingSecret`, supply it there. |

## Vendored PostgreSQL parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| postgresql.auth.database | string | `"alchemy"` | Database created by the vendored PostgreSQL chart. |
| postgresql.auth.enablePostgresUser | bool | `false` | Disable the default `postgres` superuser in the vendored PostgreSQL chart. |
| postgresql.auth.password | string | required when `postgresql.enabled=true` | Password for the vendored PostgreSQL user. Must match `persistence.postgresql.dsn` when vendored PostgreSQL is enabled. |
| postgresql.auth.username | string | `"alchemy"` | Username created by the vendored PostgreSQL chart. |
| postgresql.enabled | bool | `false` | Enable the vendored Bitnami PostgreSQL chart for local or test clusters. See the [Bitnami PostgreSQL chart](https://artifacthub.io/packages/helm/bitnami/postgresql) for additional configuration. |
| postgresql.fullnameOverride | string | `"alchemy-postgresql"` | Full name override for the vendored PostgreSQL release. |
| postgresql.primary.persistence.size | string | `"8Gi"` | PVC size for the vendored PostgreSQL primary. |
| postgresql.primary.readinessProbe | object | `{"failureThreshold":2}` | Readiness probe for the primary. Still removes an unhealthy primary promptly. |
| postgresql.primary.resources | object | `{"limits":{"memory":"1Gi"},"requests":{"cpu":"250m","memory":"512Mi"}}` | Resources for the vendored PostgreSQL primary. Overrides the upstream `nano` preset (192Mi memory limit), which risks OOM kills and unclean shutdowns under real load. |
| postgresql.primary.startupProbe | object | `{"enabled":true,"failureThreshold":30,"initialDelaySeconds":0,"periodSeconds":10,"successThreshold":1,"timeoutSeconds":5}` | Startup probe for the primary. Protects cold starts and crash recovery from liveness restarts for up to five minutes. |

## Vendored NATS parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| nats.config.jetstream.enabled | bool | `true` | Enable JetStream in the vendored NATS chart. Alchemy keeps recent function logs and unwritten invocation records in JetStream streams. |
| nats.config.jetstream.fileStore.enabled | bool | `true` | Keep queued invocations, and invocation records until a server writes them to PostgreSQL, on disk, so a NATS restart loses none. |
| nats.config.jetstream.fileStore.pvc.size | string | `"10Gi"` | PVC size for the JetStream file store. |
| nats.config.jetstream.memoryStore.enabled | bool | `true` | Keep function logs in memory; the bucket is their lasting copy. |
| nats.config.jetstream.memoryStore.maxSize | string | `"1Gi"` | JetStream memory limit. Covers `functionLogs.maxBytes`. |
| nats.config.merge.max_payload | string | `"<< 64MB >>"` | Largest message NATS accepts. Payloads carry whole function inputs and outputs, so this matches the server's payload limit. |
| nats.container.merge | object | `{"resources":{"limits":{"memory":"2Gi"},"requests":{"cpu":"100m","memory":"256Mi"}}}` | Merged into the vendored NATS container spec. Sets resources so the pod is not BestEffort QoS (first evicted under node pressure); the upstream chart sets none. |
| nats.enabled | bool | `false` | Enable the vendored NATS chart for local or test clusters. See the [NATS chart](https://artifacthub.io/packages/helm/nats/nats) for additional configuration. |
| nats.fullnameOverride | string | `"alchemy-nats"` | Full name override for the vendored NATS release. |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs](https://github.com/norwoodj/helm-docs)
