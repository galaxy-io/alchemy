# syntax=docker/dockerfile:1
# Rust functions built from source. The build stage, published as
# rust:<v>-build, compiles the files under /app to /app/handler; the last
# stage, rust:<v>, runs it. Builds run offline, so the crate's dependencies
# are fetched and compiled here: Apache Arrow and serde_json.
FROM rust:1.99-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /opt/alchemy/crate
COPY Cargo.toml Cargo.lock main.rs ./
RUN cargo build --release --locked && chmod -R a+rX /opt/alchemy "$CARGO_HOME"
COPY --chmod=755 compile /usr/local/bin/compile
ENTRYPOINT ["/usr/local/bin/compile"]

FROM gcr.io/distroless/static-debian13:latest@sha256:15f8637509792e05b97d83451b0b6ccfa4abd548f997e406ac1e72c87fe1fa78
WORKDIR /app
ENTRYPOINT ["/app/handler"]
