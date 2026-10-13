set dotenv-load

# server runs on the Mac next to compose; host runs in the Lima VM, where host.lima.internal is the Mac.
export PERSISTENCE_DSN := env("PERSISTENCE_DSN", "postgresql://alchemy:alchemy@localhost:5435/alchemy?sslmode=disable")
export NATS_URL := env("NATS_URL", "nats://localhost:4223")
host_nats_url := "nats://host.lima.internal:4223"

default:
    @just --list

# generate all checked-in generated code
gen: proto sqlc ui-gen

# generate the UI's TypeScript protobuf clients
ui-gen:
    cd ui && pnpm install && pnpm codegen

# generate sqlc Go code from datastore/postgres/{migrations,queries}
sqlc:
    sqlc generate -f datastore/postgres/sqlc.yaml

# generate protobuf and ConnectRPC Go stubs
proto:
    buf generate

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

# build host and the supervisor for the KVM host (the Lima VM is linux/arm64 on Apple silicon)
build-linux arch="arm64":
    GOOS=linux GOARCH={{ arch }} CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o bin/linux-{{ arch }}/host ./cmd/host
    GOOS=linux GOARCH={{ arch }} CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o bin/linux-{{ arch }}/supervisor ./cmd/supervisor

# start the KVM host VM, creating it on first run; `just vm down` stops it, `just vm delete` removes it
vm mode="up":
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ mode }}" in
      up)
        if limactl list --quiet | grep -qx alchemy; then limactl start alchemy; else limactl start --name alchemy --tty=false --mount-only "{{ justfile_directory() }}:w" lima.yaml; fi
        docker context inspect lima-alchemy >/dev/null 2>&1 || docker context create lima-alchemy --docker "host=unix://$HOME/.lima/alchemy/sock/docker.sock"
        ;;
      down)   limactl shell alchemy -- pkill -f 'bin/linux-arm64/host' || true; limactl stop alchemy ;;
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

# start local infra (Postgres, NATS); `just infra down` stops it, `just infra down volumes` also drops the data
infra mode="up" scope="":
    docker --context default compose {{ if mode == "down" { if scope == "volumes" { "down -v" } else { "down" } } else { "up -d --wait" } }}

# run host inside the VM (Ctrl-C stops it); it serves this machine's Firecracker capacity on NATS
host: build-linux
    limactl shell alchemy -- pkill -f 'bin/linux-arm64/host' || true
    limactl shell alchemy -- bash -c 'cd "{{ justfile_directory() }}" && exec bin/linux-arm64/host --nats="{{ host_nats_url }}"'

# run server on the Mac on :8780 (Ctrl-C stops it); it applies migrations on start
server:
    go run ./cmd/server --addr=:8780 --dsn="{{ PERSISTENCE_DSN }}" --nats="{{ NATS_URL }}"

# run the UI dev server on :5173, proxying the API to server on :8780
ui:
    cd ui && pnpm install && pnpm dev

# run host, server and the UI together; Ctrl-C stops all three
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill $(jobs -p) 2>/dev/null; limactl shell alchemy -- pkill -f "bin/linux-arm64/host" 2>/dev/null || true' EXIT
    just host &
    just server &
    until curl -sf http://localhost:8780/healthz > /dev/null 2>&1; do sleep 0.5; done
    just ui

# build the UI bundle server embeds (go build -tags embedui)
ui-dist:
    cd ui && pnpm install && pnpm build

# build the embed example in all four languages into the VM's Docker daemon
example:
    for lang in go python typescript rust; do \
      docker --context lima-alchemy build --quiet --tag ghcr.io/galaxy-io/alchemy/embed-$lang:dev examples/embed/$lang || exit 1; \
    done

# register the four embed functions on the running server and invoke each
# `count` times with `rows`-row batches; run `just example` first
demo count="10" rows="100" concurrency="4":
    go run ./examples/embed/tool --count={{ count }} --rows={{ rows }} --concurrency={{ concurrency }}
