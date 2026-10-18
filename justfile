set dotenv-load

# server runs on the Mac next to compose; host runs in the Lima VM, where host.lima.internal is the Mac.
export PERSISTENCE_DSN := env("PERSISTENCE_DSN", "postgresql://alchemy:alchemy@localhost:5435/alchemy?sslmode=disable")
export NATS_URL := env("NATS_URL", "nats://localhost:4223")
host_nats_url := "nats://host.lima.internal:4223"
# text logs read better in a terminal; the chart defaults to json
export LOG_FORMAT := env("LOG_FORMAT", "text")
export LOG_LEVEL := env("LOG_LEVEL", "info")

default:
    @just --list

# start local infra (Postgres, NATS); `just infra down` stops it, `just infra down volumes` also drops the data
infra mode="up" scope="":
    docker --context default compose {{ if mode == "down" { if scope == "volumes" { "down -v" } else { "down" } } else { "up -d --wait" } }}

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
          bin/linux-arm64/host --nats="{{ host_nats_url }}" --name=host-$i --data-dir=/var/lib/alchemy/host-$i --uid-base=$((100000 * i)) \
          --memory-mib={{ memory }} --warm-ttl={{ warm }} --prewarm={{ prewarm }} 2>&1 | sed -u "s/^/[host-$i] /" & \
      done; wait'

# run server on the Mac on :8780 (Ctrl-C stops it); it applies migrations on start
server:
    go run ./cmd/server --addr=:8780 --dsn="{{ PERSISTENCE_DSN }}" --nats="{{ NATS_URL }}"

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

# build the server and host container images for `arch`
images arch=`go env GOARCH`: (binaries arch)
    docker build --platform linux/{{ arch }} -f cmd/server/Dockerfile -t galaxy-io/alchemy/server:latest .
    docker build --platform linux/{{ arch }} -f cmd/host/Dockerfile -t galaxy-io/alchemy/host:latest .

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
