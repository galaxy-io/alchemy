FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM ghcr.io/galaxy-io/alchemy/runtime/static:13
COPY --from=build /src/target/release/embed /app/handler
