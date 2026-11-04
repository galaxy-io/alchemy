// Command host serves one machine's Firecracker capacity on the bus: it
// builds artifacts, boots instances and runs invocations the server sends
// it. It holds nothing durable and needs KVM, not Postgres.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"gocloud.dev/blob"

	"github.com/galaxy-io/alchemy/api/host/v1/hostv1connect"
	"github.com/galaxy-io/alchemy/cmd/internal/logger"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/driver/firecracker"
	"github.com/galaxy-io/alchemy/internal/host"
	"github.com/galaxy-io/alchemy/internal/logs"
	"github.com/galaxy-io/alchemy/internal/registry"
)

func main() {
	log, err := logger.New(os.Stdout)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if err := run(log); err != nil {
		log.Error("host", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	hostname, _ := os.Hostname()
	natsURL := envOr("NATS_URL", "nats://localhost:4223")
	// Empty keeps function logs on NATS only.
	logsBucket := os.Getenv("LOGS_BUCKET")
	// Empty means builds with layers fail.
	artifactsBucket := os.Getenv("ARTIFACTS_BUCKET")
	cfg := host.DefaultConfig()
	cfg.Name = envOr("HOST_NAME", hostname)
	invokeAddr := envOr("INVOKE_ADDR", ":8790")
	url, err := invokeURL(os.Getenv("INVOKE_URL"), hostname, invokeAddr)
	if err != nil {
		return err
	}
	cfg.InvokeURL = url
	fcCfg := firecracker.Config{
		FirecrackerBin: envOr("FIRECRACKER_BIN", "/usr/local/bin/firecracker"),
		JailerBin:      envOr("JAILER_BIN", "/usr/local/bin/jailer"),
		Kernel:         os.Getenv("KERNEL_IMAGE"),
		SupervisorBin:  envOr("SUPERVISOR_BIN", filepath.Join(filepath.Dir(os.Args[0]), "supervisor")),
		DataDir:        envOr("DATA_DIR", "/var/lib/alchemy"),
		UIDBase:        10_000_000,
		Console:        true,
		Keychain:       registry.Keychain(registry.AWS(), registry.GCP()),
		Snapshots:      true,
	}
	if err := errors.Join(
		envParse("MAX_INSTANCES", &cfg.MaxConcurrency, strconv.Atoi),
		envParse("MEMORY_BUDGET_MIB", &cfg.MemoryMiB, parseInt64),
		envParse("WARM_INSTANCE_TTL", &cfg.WarmTTL, time.ParseDuration),
		envParse("PREWARM_COUNT", &cfg.Prewarm, strconv.Atoi),
		envParse("KEPT_VERSIONS", &cfg.KeptVersions, strconv.Atoi),
		envParse("VERSION_IDLE_TTL", &cfg.VersionIdleTTL, time.ParseDuration),
		envParse("SECRETS_REFRESH_INTERVAL", &cfg.SecretsRefresh, time.ParseDuration),
		envParse("UID_BASE", &fcCfg.UIDBase, strconv.Atoi),
		envParse("CONSOLE_ENABLED", &fcCfg.Console, strconv.ParseBool),
		envParse("SNAPSHOTS_ENABLED", &fcCfg.Snapshots, strconv.ParseBool),
	); err != nil {
		return err
	}
	if fcCfg.Kernel == "" {
		if kernels, _ := filepath.Glob("/var/lib/firecracker/vmlinux-*"); len(kernels) > 0 {
			fcCfg.Kernel = kernels[len(kernels)-1]
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log = log.With("host", cfg.Name)
	drv, err := firecracker.New(fcCfg, log)
	if err != nil {
		return fmt.Errorf("firecracker driver: %w", err)
	}
	b, err := bus.Connect(natsURL, "host/"+cfg.Name)
	if err != nil {
		return err
	}
	defer b.Close()
	bucket, err := logs.OpenBucket(ctx, logsBucket)
	if err != nil {
		return fmt.Errorf("function logs bucket: %w", err)
	}
	if bucket == nil {
		log.Warn("no function logs bucket: logs are kept on NATS only, for its retention")
	} else {
		defer func() { _ = bucket.Close() }()
	}

	var artifacts *blob.Bucket
	if artifactsBucket != "" {
		if artifacts, err = blob.OpenBucket(ctx, artifactsBucket); err != nil {
			return fmt.Errorf("artifacts bucket: %w", err)
		}
		defer func() { _ = artifacts.Close() }()
	}

	h := host.New(cfg, drv, b, bucket, artifacts, log)
	// Listening before Run, so the URL its first heartbeat names answers.
	ln, err := net.Listen("tcp", invokeAddr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", invokeAddr, err)
	}
	srv := invokeServer(h)
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("serve invocations", "err", err)
		}
	}()
	log.Info("serving invocations", "addr", invokeAddr, "url", cfg.InvokeURL)
	err = h.Run(ctx)
	// Run has drained every invocation, so only refused ones can be open.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return errors.Join(err, srv.Shutdown(shutdownCtx))
}

// maxInvokeRequestBytes bounds an invoke request: the input, the artifact
// and the rest. It sits above the server's 64MB payload limit, which the
// server enforces.
const maxInvokeRequestBytes = 72 << 20

// invokeServer serves h's HostService over HTTP/2 without TLS, the way
// servers dial it. Nothing is gzipped: payloads cross a private network,
// where compressing 64MB costs more than it saves.
func invokeServer(h *host.Host) *http.Server {
	mux := http.NewServeMux()
	mux.Handle(hostv1connect.NewHostServiceHandler(h,
		connect.WithReadMaxBytes(maxInvokeRequestBytes),
		connect.WithCompression("gzip", nil, nil),
	))
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	return &http.Server{Handler: mux, Protocols: protocols, ReadHeaderTimeout: 10 * time.Second}
}

// invokeURL is where the servers dial this host: INVOKE_URL, else the
// hostname on InvokeAddr's port.
func invokeURL(set, hostname, addr string) (string, error) {
	if set != "" {
		return set, nil
	}
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "", fmt.Errorf("INVOKE_ADDR: %w", err)
	}
	return "http://" + net.JoinHostPort(hostname, port), nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envParse sets v from key, when it is set.
func envParse[T any](key string, v *T, parse func(string) (T, error)) error {
	s := os.Getenv(key)
	if s == "" {
		return nil
	}
	parsed, err := parse(s)
	if err != nil {
		return fmt.Errorf("%s: %w", key, err)
	}
	*v = parsed
	return nil
}

func parseInt64(s string) (int64, error) { return strconv.ParseInt(s, 10, 64) }
