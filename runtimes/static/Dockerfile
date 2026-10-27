# syntax=docker/dockerfile:1
# Static binaries build on this, Go and Rust among them: COPY handler /app/
FROM gcr.io/distroless/static-debian13:latest@sha256:15f8637509792e05b97d83451b0b6ccfa4abd548f997e406ac1e72c87fe1fa78
WORKDIR /app
ENTRYPOINT ["/app/handler"]
