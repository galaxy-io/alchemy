set dotenv-load

default:
    @just --list

# start local infra (Postgres, NATS, RustFS, a registry) and make the buckets; `just infra zitadel|keycloak` adds that provider, `just infra down [volumes]` stops everything
infra mode="up" scope="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "{{ mode }}" = down ]; then
      docker --context default compose --profile zitadel --profile keycloak down {{ if scope == "volumes" { "-v" } else { "" } }}
      exit
    fi
    # Zitadel writes its machine user's token here on first start
    mkdir -p .zitadel
    docker --context default compose {{ if mode == "up" { "" } else { "--profile " + mode } }} up -d --wait
    # Keycloak's master realm refuses plain-http admin sign-ins from off the
    # container, which is where the server creates alchemy's realm from.
    if [ "{{ mode }}" = keycloak ]; then
      docker --context default compose --profile keycloak exec -T keycloak sh -c \
        '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin >/dev/null && /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE'
    fi
    rc alias set alchemy http://localhost:9000 alchemy alchemy123 >/dev/null
    for i in $(seq 1 30); do rc ls alchemy/ >/dev/null 2>&1 && break; sleep 1; done
    # open to anonymous access, so nothing carries keys
    for bucket in alchemy-logs alchemy-artifacts; do
      rc ls "alchemy/$bucket" >/dev/null 2>&1 || rc mb "alchemy/$bucket"
      rc anonymous set public "alchemy/$bucket" >/dev/null
    done

# start the KVM host VM, creating it on first run; `just vm down` stops it, `just vm delete` removes it
vm mode="up":
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ mode }}" in
      up)
        if limactl list --quiet | grep -qx alchemy; then limactl start alchemy; else limactl start --name alchemy --tty=false --mount-only "{{ justfile_directory() }}:w" lima.yaml; fi
        docker context inspect lima-alchemy >/dev/null 2>&1 || docker context create lima-alchemy --docker "host=unix://$HOME/.lima/alchemy/sock/docker.sock"
        ;;
      down)   limactl shell alchemy -- sudo pkill -f 'bin/linux-arm64/host' || true; limactl stop alchemy ;;
      delete) limactl delete --force alchemy; docker context rm -f lima-alchemy >/dev/null 2>&1 || true ;;
      *)      echo "unknown mode {{ mode }}" >&2; exit 2 ;;
    esac

# show what is running: the VM, host and microVMs inside it
status:
    #!/usr/bin/env bash
    limactl list | awk 'NR==1 || /^alchemy/'
    if limactl list | grep -q 'alchemy.*Running'; then
      echo "hosts:    $(limactl shell alchemy -- pgrep -af 'bin/linux-arm64/host' | grep -v pgrep || echo none)"
      echo "microVMs: $(limactl shell alchemy -- pgrep -c firecracker || true)"
    fi

# run `count` hosts in the VM with `memory` MiB each, reusing instances for `warm` (0s: always cold boot) and keeping `prewarm` booted per function; Ctrl-C stops them
# hosts run as root for the jailer, each in a systemd scope of its own so it can manage its microVMs' cgroups, as in a pod
host count="1" memory="512" warm="5m" prewarm="0": build-linux
    #!/usr/bin/env bash
    set -euo pipefail
    # old hosts drain before they exit, and must be gone before new ones share their data dirs
    limactl shell alchemy -- bash -c 'sudo pkill -f bin/linux-arm64/host; while pgrep -f bin/linux-arm64/host >/dev/null; do sleep 0.5; done' || true
    # the VM reaches compose on the Mac at host.lima.internal; the buckets are open to anonymous access
    # the same NATS_URL as server; the VM reaches localhost at host.lima.internal
    nats="${NATS_URL:-nats://localhost:4223}"
    nats="${nats/localhost/host.lima.internal}"
    nats="${nats/127.0.0.1/host.lima.internal}"
    limactl shell alchemy -- bash -c '
      cd "{{ justfile_directory() }}"
      bucket="endpoint=http://host.lima.internal:9000&region=us-east-1&use_path_style=true&anonymous=true"
      trap "kill 0" EXIT INT TERM HUP
      for i in $(seq 1 {{ count }}); do
        sudo systemd-run --scope --quiet -p Delegate=yes -- env \
          NATS_URL="'"$nats"'" \
          LOGS_BUCKET="s3://alchemy-logs?$bucket" \
          ARTIFACTS_BUCKET="s3://alchemy-artifacts?$bucket" \
          LOG_FORMAT=text LOG_LEVEL="${LOG_LEVEL:-info}" \
          HOST_NAME="host-$i" DATA_DIR="/var/lib/alchemy/host-$i" UID_BASE=$((10000000 * i)) \
          MEMORY_BUDGET_MIB={{ memory }} WARM_INSTANCE_TTL={{ warm }} PREWARM_COUNT={{ prewarm }} \
          bin/linux-arm64/host 2>&1 | sed -u "s/^/[host-$i] /" &
      done
      wait'

# run server on the Mac on :8780 against compose (env overrides); it applies migrations on start; `just server zitadel|keycloak|proxy` turns auth on
# hosts pull runtimes from the compose registry by the Mac's private address, which needs no TLS
server mode="":
    #!/usr/bin/env bash
    set -euo pipefail
    # the compose providers, which the server sets up on boot; proxy needs only AUTH_PROXY_TENANT, from the env
    case "{{ mode }}" in
      zitadel)
        export AUTH_ISSUER="${AUTH_ISSUER:-http://localhost:8301}" \
          AUTH_PAT="${AUTH_PAT:-$(cat .zitadel/pat 2>/dev/null)}" \
          AUTH_UI_ORIGIN="${AUTH_UI_ORIGIN:-http://localhost:5173}" ;;
      keycloak)
        export AUTH_ISSUER="${AUTH_ISSUER:-http://localhost:8401/realms/alchemy}" \
          AUTH_CLIENT_ID="${AUTH_CLIENT_ID:-alchemy}" \
          AUTH_CLIENT_SECRET="${AUTH_CLIENT_SECRET:-alchemy}" \
          AUTH_ADMIN_USERNAME="${AUTH_ADMIN_USERNAME:-admin}" \
          AUTH_ADMIN_PASSWORD="${AUTH_ADMIN_PASSWORD:-admin}" \
          AUTH_UI_ORIGIN="${AUTH_UI_ORIGIN:-http://localhost:5173}" ;;
    esac
    PERSISTENCE_DSN="${PERSISTENCE_DSN:-postgresql://alchemy:alchemy@localhost:5435/alchemy?sslmode=disable}" \
    NATS_URL="${NATS_URL:-nats://localhost:4223}" \
    LOGS_BUCKET="${LOGS_BUCKET:-s3://alchemy-logs?endpoint=http://localhost:9000&region=us-east-1&use_path_style=true&anonymous=true}" \
    ARTIFACTS_BUCKET="${ARTIFACTS_BUCKET:-s3://alchemy-artifacts?endpoint=http://localhost:9000&region=us-east-1&use_path_style=true&anonymous=true}" \
    RUNTIME_IMAGE_PREFIX="${RUNTIME_IMAGE_PREFIX:-192.168.5.2:5001/galaxy-io/alchemy/runtime}" \
    ENCRYPTION_KEY="${ENCRYPTION_KEY:-ZGV2LW9ubHktYWxjaGVteS1lbmNyeXB0aW9uLWtleSE=}" \
    LOG_FORMAT="${LOG_FORMAT:-text}" \
    LOG_LEVEL="${LOG_LEVEL:-info}" \
    AUTH_PROVIDER="${AUTH_PROVIDER:-{{ mode }}}" \
    go run ./cmd/server

# run the UI dev server on :5173, proxying the API to server on :8780
ui:
    cd ui && pnpm install && pnpm dev

# run the docs site locally (mintlify preview at :3000; installs deps on first run)
docs:
    cd docs && pnpm install && pnpm dev

# run hosts, server and the UI together; `just dev zitadel|keycloak|proxy` turns auth on; Ctrl-C stops them all
dev mode="" count="3" memory="512" warm="5m" prewarm="0":
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill $(jobs -p) 2>/dev/null; limactl shell alchemy -- sudo pkill -f "bin/linux-arm64/host" 2>/dev/null || true' EXIT
    just host {{ count }} {{ memory }} {{ warm }} {{ prewarm }} &
    just server {{ mode }} &
    until curl -sf http://localhost:8780/healthz > /dev/null 2>&1; do sleep 0.5; done
    just ui

# generate all checked-in generated code
gen: proto sqlc ui-gen

# generate protobuf and ConnectRPC Go stubs
proto:
    buf generate

# generate sqlc Go code from datastore/postgres/{migrations,queries}
sqlc:
    sqlc generate -f datastore/postgres/sqlc.yaml

# generate the UI's TypeScript protobuf clients
ui-gen:
    cd ui && pnpm install && pnpm codegen

# lint protobuf definitions
proto-lint:
    buf lint

# format protobuf definitions
proto-format mode="fix":
    buf format {{ if mode == "check" { "-d --exit-code" } else { "-w" } }}

# verify generated protobuf files are up to date
proto-check:
    buf generate
    git diff --exit-code -- api

# build the web UI into ui/build, which server embeds with -tags embedui
ui-build:
    cd ui && pnpm install && pnpm build

# run every UI gate: types, lint, format, both builds, the package checks, and the committed route tree
ui-check:
    cd ui && pnpm install --frozen-lockfile && pnpm check && git diff --exit-code src/host/routeTree.gen.ts

# build host and the supervisor for the KVM host (the Lima VM is linux/arm64 on Apple silicon)
build-linux arch="arm64":
    GOOS=linux GOARCH={{ arch }} CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o bin/linux-{{ arch }}/host ./cmd/host
    GOOS=linux GOARCH={{ arch }} CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o bin/linux-{{ arch }}/supervisor ./cmd/supervisor

# build the Linux binaries the container images ship, the server with the UI embedded (`arch`: amd64 or arm64, default this machine's)
binaries arch=`go env GOARCH`: ui-build
    CGO_ENABLED=0 GOOS=linux GOARCH={{ arch }} go build -tags embedui -trimpath -ldflags='-s -w' -o bin/alchemy/server ./cmd/server
    CGO_ENABLED=0 GOOS=linux GOARCH={{ arch }} go build -trimpath -ldflags='-s -w' -o bin/alchemy/host ./cmd/host
    CGO_ENABLED=0 GOOS=linux GOARCH={{ arch }} go build -trimpath -ldflags='-s -w' -o bin/alchemy/supervisor ./cmd/supervisor

# build the server and host images for `arch`, and the runtimes, which go to the compose registry for the hosts
images arch=`go env GOARCH`: (binaries arch)
    #!/usr/bin/env bash
    set -euo pipefail
    build() { docker --context default build --platform linux/{{ arch }} "$@"; }
    build -f cmd/server/Dockerfile -t galaxy-io/alchemy/server:latest .
    build -f cmd/host/Dockerfile -t galaxy-io/alchemy/host:latest .
    # a -build tag is the build stage of its runtime's Dockerfile
    for tag in python:3.13 node:24 static:13 go:1.27 go:1.27-build rust:1.99 rust:1.99-build; do
      image="localhost:5001/galaxy-io/alchemy/runtime/$tag"
      case "$tag" in
        *-build) build --target build -t "$image" "runtimes/${tag%%:*}" ;;
        *)       build -t "$image" "runtimes/${tag%%:*}" ;;
      esac
      docker --context default push --quiet "$image"
    done

# run cmd in every Go module
_each cmd:
    for dir in $(find . -name go.mod -not -path "./ui/*" -exec dirname {} \;); do (cd "$dir" && {{ cmd }}) || exit 1; done

# format Go, UI and proto; `just format check` verifies without writing
format mode="fix": (go-format mode) (ui-format mode) (proto-format mode)

# run all linters; `just lint check` runs without fixing
lint mode="fix": (go-lint mode) (ui-lint mode)

# gofumpt + goimports across every Go module (settings in .golangci.yaml)
go-format mode="fix": (_each ("GOWORK=off golangci-lint fmt " + (if mode == "check" { "--diff " } else { "" }) + "./..."))

# Go linters across every Go module, once per GOOS so platform-specific files are checked everywhere
go-lint mode="fix": (_each ("for goos in linux darwin; do GOOS=$goos GOWORK=off golangci-lint run " + (if mode == "check" { "" } else { "--fix " }) + "./... || exit 1; done"))

# Biome formatting for the UI package
ui-format mode="fix":
    cd ui && pnpm run {{ if mode == "check" { "format:check" } else { "format" } }}

# Biome lint for the UI package
ui-lint mode="fix":
    cd ui && pnpm run {{ if mode == "check" { "lint:check" } else { "lint" } }}

# run the unit tests in every Go module
test: (_each "GOWORK=off go test ./...")

# tidy go.mod and go.sum in every Go module
tidy: (_each "GOWORK=off go mod tidy")
