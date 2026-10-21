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
	"syscall"
	"time"

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
	logsBucket := os.Getenv("FUNCTION_LOGS_BUCKET")
	cfg := host.DefaultConfig()
	cfg.Name = envOr("HOST_NAME", hostname)
	fcCfg := firecracker.Config{
		FirecrackerBin: envOr("FIRECRACKER", "/usr/local/bin/firecracker"),
		JailerBin:      envOr("JAILER", "/usr/local/bin/jailer"),
		Kernel:         os.Getenv("KERNEL"),
		SupervisorBin:  envOr("SUPERVISOR", filepath.Join(filepath.Dir(os.Args[0]), "supervisor")),
		DataDir:        envOr("DATA_DIR", "/var/lib/alchemy"),
		UIDBase:        100000,
		Console:        true,
		Keychain:       registry.Keychain(registry.AWS(), registry.GCP()),
	}
	if err := errors.Join(
		envParse("MAX_CONCURRENCY", &cfg.MaxConcurrency, strconv.Atoi),
		envParse("MEMORY_MIB", &cfg.MemoryMiB, parseInt64),
		envParse("WARM_TTL", &cfg.WarmTTL, time.ParseDuration),
		envParse("PREWARM", &cfg.Prewarm, strconv.Atoi),
		envParse("UID_BASE", &fcCfg.UIDBase, strconv.Atoi),
		envParse("CONSOLE", &fcCfg.Console, strconv.ParseBool),
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

	return host.New(cfg, drv, b, bucket, log).Run(ctx)
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
