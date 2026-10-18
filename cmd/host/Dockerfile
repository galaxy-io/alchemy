# syntax=docker/dockerfile:1
# The host image carries everything a microVM needs: Firecracker and its
# jailer, a guest kernel and the supervisor every rootfs gets as init. It runs
# as root on bare-metal nodes with /dev/kvm; images are pulled from registries
# in-process, so no container daemon is needed.
ARG FC_VERSION=v1.17.0

# The guest kernel is the newest 6.1 build from Firecracker's CI bucket, as in
# their getting-started guide.
FROM debian:13-slim AS firecracker
ARG FC_VERSION
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
    ARCH=$([ "$TARGETARCH" = arm64 ] && echo aarch64 || echo x86_64) && \
    curl -fsSL "https://github.com/firecracker-microvm/firecracker/releases/download/${FC_VERSION}/firecracker-${FC_VERSION}-${ARCH}.tgz" | tar -xz -C /tmp && \
    install -m 0755 "/tmp/release-${FC_VERSION}-${ARCH}/firecracker-${FC_VERSION}-${ARCH}" /firecracker && \
    install -m 0755 "/tmp/release-${FC_VERSION}-${ARCH}/jailer-${FC_VERSION}-${ARCH}" /jailer && \
    S3="https://s3.amazonaws.com/spec.ccfc.min" && \
    PREFIX=$(curl -fsSL "$S3?list-type=2&prefix=firecracker-ci/&delimiter=/" | grep -oP '(?<=<Prefix>)firecracker-ci/v[0-9]+\.[0-9]+/(?=</Prefix>)' | sort -V | tail -1) && \
    KERNEL=$(curl -fsSL "$S3?list-type=2&prefix=${PREFIX}${ARCH}/vmlinux-" | grep -oP "(?<=<Key>)${PREFIX}${ARCH}/vmlinux-6\.1\.[0-9]+(?=</Key>)" | sort -V | tail -1) && \
    mkdir /kernel && curl -fsSL -o "/kernel/$(basename "$KERNEL")" "$S3/$KERNEL"

# mke2fs and tar build each rootfs; ca-certificates is for registry TLS.
FROM debian:13-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates e2fsprogs && \
    rm -rf /var/lib/apt/lists/*

COPY --from=firecracker /firecracker /jailer /usr/local/bin/
COPY --from=firecracker /kernel/ /var/lib/firecracker/
COPY bin/alchemy/host bin/alchemy/supervisor /usr/local/bin/

ENTRYPOINT ["/usr/local/bin/host"]
