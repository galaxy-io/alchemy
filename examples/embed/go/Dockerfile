FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum main.go ./
RUN CGO_ENABLED=0 go build -trimpath -o /out/embed .

# No shell, no libc: the supervisor and the function are both static.
FROM scratch
COPY --from=build /out/embed /embed
ENTRYPOINT ["/embed"]
