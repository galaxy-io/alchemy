# syntax=docker/dockerfile:1
FROM gcr.io/distroless/static:nonroot

COPY bin/alchemy/server /app

EXPOSE 8780
USER 65532:65532

ENTRYPOINT ["/app"]
