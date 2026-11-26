// Command host serves one machine's Firecracker capacity on the bus: it
// builds artifacts, boots instances and runs invocations the server sends
// it. It holds nothing durable and needs KVM, not Postgres.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"gocloud.dev/blob"

	"github.com/galaxy-io/alchemy/cmd/internal/logger"
	"github.com/galaxy-io/alchemy/cmd/internal/otel"
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
		EgressSubnet:   envOr("EGRESS_SUBNET", "169.254.200.0/21"),
		EgressDeny:     envList("EGRESS_DENY"),
		EgressDNS:      envList("EGRESS_DNS"),
		RegistryAllow:  envList("REGISTRY_ALLOW"),
	}
	if len(fcCfg.EgressDNS) == 0 {
		fcCfg.EgressDNS = []string{"1.1.1.1", "8.8.8.8"}
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

	metrics, flushMetrics, err := otel.FromEnv(ctx, log)
	if err != nil {
		return err
	}
	defer flushMetrics()

	return host.New(cfg, drv, b, bucket, artifacts, metrics, log).Run(ctx)
}

// envList splits a comma-separated variable, dropping empty entries.
func envList(key string) []string {
	var out []string
	for v := range strings.SplitSeq(os.Getenv(key), ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
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
