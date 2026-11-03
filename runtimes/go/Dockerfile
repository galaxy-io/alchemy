# syntax=docker/dockerfile:1
# Go functions built from source. The build stage, published as go:<v>-build,
# compiles the files under /app to /app/handler; the last stage, go:<v>, runs
# it. Builds run offline, so the module's dependencies are fetched and
# compiled here: the standard library and Apache Arrow.
FROM golang:1.27-alpine AS build
ENV CGO_ENABLED=0 GOFLAGS=-trimpath GOTOOLCHAIN=local GOENV=off \
    GOPATH=/tmp/go GOMODCACHE=/opt/go/mod GOCACHE=/opt/go/cache
WORKDIR /opt/alchemy/module
COPY go.mod go.sum warm.go ./
RUN go mod download && go build -o /dev/null . && rm warm.go && chmod -R a+rX /opt/go
ENV GOPROXY=off GOSUMDB=off
COPY --chmod=755 compile /usr/local/bin/compile
ENTRYPOINT ["/usr/local/bin/compile"]

FROM gcr.io/distroless/static-debian13:latest@sha256:15f8637509792e05b97d83451b0b6ccfa4abd548f997e406ac1e72c87fe1fa78
WORKDIR /app
ENTRYPOINT ["/app/handler"]
