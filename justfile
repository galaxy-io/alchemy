set dotenv-load

# server runs on the Mac next to compose; host runs in the Lima VM, where host.lima.internal is the Mac.
export PERSISTENCE_DSN := env("PERSISTENCE_DSN", "postgresql://alchemy:alchemy@localhost:5435/alchemy?sslmode=disable")
export NATS_URL := env("NATS_URL", "nats://localhost:4223")
host_nats_url := "nats://host.lima.internal:4223"
# the buckets live in RustFS from compose, open to anonymous access so nothing carries keys; the VM reaches it at host.lima.internal
rustfs_access_key := "alchemy"
rustfs_secret_key := "alchemy123"
bucket_query := "?endpoint=http://localhost:9000&region=us-east-1&use_path_style=true&anonymous=true"
export LOGS_BUCKET := env("LOGS_BUCKET", "s3://alchemy-logs" + bucket_query)
export ARTIFACTS_BUCKET := env("ARTIFACTS_BUCKET", "s3://alchemy-artifacts" + bucket_query)
host_logs_bucket := replace(LOGS_BUCKET, "localhost", "host.lima.internal")
host_artifacts_bucket := replace(ARTIFACTS_BUCKET, "localhost", "host.lima.internal")
# runtime images come from a registry in compose: `just images` pushes them there, and hosts pull them from the Mac by its private address, which is host.lima.internal and needs no TLS
registry := "localhost:5001"
host_registry := "192.168.5.2:5001"
export RUNTIME_IMAGE_PREFIX := env("RUNTIME_IMAGE_PREFIX", host_registry + "/galaxy-io/alchemy/runtime")
# tenant secrets are encrypted at rest with this key, a fixed one for dev
export ENCRYPTION_KEY := env("ENCRYPTION_KEY", "ZGV2LW9ubHktYWxjaGVteS1lbmNyeXB0aW9uLWtleSE=")
# text logs read better in a terminal; the chart defaults to json
export LOG_FORMAT := env("LOG_FORMAT", "text")
export LOG_LEVEL := env("LOG_LEVEL", "info")

default:
    @just --list

# start local infra (Postgres, NATS, RustFS, a registry) and make the buckets; `just infra down` stops it, `just infra down volumes` also drops the data
infra mode="up" scope="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "{{ mode }}" = down ]; then
      docker --context default compose down {{ if scope == "volumes" { "-v" } else { "" } }}
      exit
    fi
    docker --context default compose up -d --wait
    rc alias set alchemy http://localhost:9000 "{{ rustfs_access_key }}" "{{ rustfs_secret_key }}" >/dev/null
    for i in $(seq 1 30); do rc ls alchemy/ >/dev/null 2>&1 && break; sleep 1; done
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
    if limactl list --quiet | grep -qx alchemy && limactl list | grep -q 'alchemy.*Running'; then
      echo "host:     $(limactl shell alchemy -- pgrep -af 'bin/linux-arm64/host' | grep -v pgrep || echo none)"
      echo "microVMs:   $(limactl shell alchemy -- pgrep -c firecracker || true)"
    fi

# run `count` hosts in the VM with `memory` MiB each, reusing instances for `warm` (0s: always cold boot) and keeping `prewarm` booted per function; Ctrl-C stops them
# hosts run as root for the jailer, each in a systemd scope of its own so it can manage its microVMs' cgroups, as in a pod
host count="3" memory="512" warm="5m" prewarm="0": build-linux
    limactl shell alchemy -- sudo pkill -f 'bin/linux-arm64/host' || true
    limactl shell alchemy -- bash -c 'cd "{{ justfile_directory() }}" && trap "kill 0" EXIT INT TERM HUP; \
      for i in $(seq 1 {{ count }}); do \
        sudo systemd-run --scope --quiet -p Delegate=yes -- env LOG_FORMAT={{ LOG_FORMAT }} LOG_LEVEL={{ LOG_LEVEL }} \
          NATS_URL="{{ host_nats_url }}" LOGS_BUCKET="{{ host_logs_bucket }}" ARTIFACTS_BUCKET="{{ host_artifacts_bucket }}" \
          HOST_NAME=host-$i DATA_DIR=/var/lib/alchemy/host-$i UID_BASE=$((10000000 * i)) \
          MEMORY_BUDGET_MIB={{ memory }} WARM_INSTANCE_TTL={{ warm }} PREWARM_COUNT={{ prewarm }} bin/linux-arm64/host 2>&1 | sed -u "s/^/[host-$i] /" & \
      done; wait'

# run server on the Mac on :8780 (Ctrl-C stops it); it applies migrations on start
server:
    go run ./cmd/server

# run the UI dev server on :5173, proxying the API to server on :8780
ui:
    cd ui && pnpm install && pnpm dev

# run hosts, server and the UI (when present) together; Ctrl-C stops them all
dev count="3" memory="512" warm="5m" prewarm="0":
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill $(jobs -p) 2>/dev/null; limactl shell alchemy -- sudo pkill -f "bin/linux-arm64/host" 2>/dev/null || true' EXIT
    just host {{ count }} {{ memory }} {{ warm }} {{ prewarm }} &
    just server &
    until curl -sf http://localhost:8780/healthz > /dev/null 2>&1; do sleep 0.5; done
    if [ -d ui ]; then just ui; else wait; fi

# generate all checked-in generated code
gen: proto sqlc ui-gen

# generate the UI's TypeScript protobuf clients
ui-gen:
    cd ui && pnpm install && pnpm codegen

# generate protobuf and ConnectRPC Go stubs
proto:
    buf generate

# generate sqlc Go code from datastore/postgres/{migrations,queries}
sqlc:
    sqlc generate -f datastore/postgres/sqlc.yaml

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

# build the server, host and runtime container images for `arch`, and push the runtimes to the registry from `just infra` for the hosts
images arch=`go env GOARCH`: (binaries arch)
    docker --context default build --platform linux/{{ arch }} -f cmd/server/Dockerfile -t galaxy-io/alchemy/server:latest .
    docker --context default build --platform linux/{{ arch }} -f cmd/host/Dockerfile -t galaxy-io/alchemy/host:latest .
    for runtime in python:3.13 node:24 static:13; do \
      docker --context default build --platform linux/{{ arch }} -t "galaxy-io/alchemy/runtime/$runtime" "runtimes/${runtime%%:*}" && \
      docker --context default tag "galaxy-io/alchemy/runtime/$runtime" "{{ registry }}/galaxy-io/alchemy/runtime/$runtime" && \
      docker --context default push --quiet "{{ registry }}/galaxy-io/alchemy/runtime/$runtime"; \
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
