FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum main.go ./
RUN CGO_ENABLED=0 go build -trimpath -o /out/handler .

FROM ghcr.io/galaxy-io/alchemy/runtime/static:13
COPY --from=build /out/handler /app/handler
