// Command host serves one machine's Firecracker capacity on the bus: it
// builds artifacts, boots instances and runs invocations the server sends
// it. It holds nothing durable and needs KVM, not Postgres.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/driver/firecracker"
	"github.com/galaxy-io/alchemy/internal/host"
	"github.com/galaxy-io/alchemy/internal/registry"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("host", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg := host.DefaultConfig()
	cfg.Name, _ = os.Hostname()
	fcCfg := firecracker.Config{
		FirecrackerBin: "/usr/local/bin/firecracker",
		SupervisorBin:  filepath.Join(filepath.Dir(os.Args[0]), "supervisor"),
		CacheDir:       filepath.Join(userCacheDir(), "alchemy"),
		RunDir:         filepath.Join(os.TempDir(), "alchemy"),
		Console:        true,
		Keychain:       registry.Keychain(registry.AWS(), registry.GCP()),
	}

	natsURL := flag.String("nats", envOr("NATS_URL", "nats://localhost:4223"), "NATS URL (env NATS_URL)")
	flag.StringVar(&cfg.Name, "name", cfg.Name, "this host's name on the bus")
	flag.IntVar(&cfg.MaxConcurrency, "max-concurrency", cfg.MaxConcurrency, "invocations allowed to hold an instance at once")
	flag.Int64Var(&cfg.MemoryMiB, "memory-mib", cfg.MemoryMiB, "guest memory this host may commit across busy and warm instances (0: no limit)")
	flag.DurationVar(&cfg.WarmTTL, "warm-ttl", cfg.WarmTTL, "how long a finished instance stays booted for the next invocation (0: cold boot every time)")
	flag.IntVar(&cfg.Prewarm, "prewarm", cfg.Prewarm, "idle instances kept booted per artifact before any invocation arrives")
	flag.StringVar(&fcCfg.FirecrackerBin, "firecracker", fcCfg.FirecrackerBin, "firecracker executable")
	flag.StringVar(&fcCfg.Kernel, "kernel", "", "guest kernel image (default: newest /var/lib/firecracker/vmlinux-*)")
	flag.StringVar(&fcCfg.SupervisorBin, "supervisor", fcCfg.SupervisorBin, "static Linux build of cmd/supervisor to put in every rootfs")
	flag.StringVar(&fcCfg.CacheDir, "cache-dir", fcCfg.CacheDir, "where built rootfs images are kept")
	flag.StringVar(&fcCfg.RunDir, "run-dir", fcCfg.RunDir, "where running microVMs keep their sockets and logs")
	flag.BoolVar(&fcCfg.Console, "console", fcCfg.Console, "keep the guest serial console on (observable, slower boot)")
	flag.Parse()
	if fcCfg.Kernel == "" {
		if kernels, _ := filepath.Glob("/var/lib/firecracker/vmlinux-*"); len(kernels) > 0 {
			fcCfg.Kernel = kernels[len(kernels)-1]
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	drv, err := firecracker.New(fcCfg, log)
	if err != nil {
		return fmt.Errorf("firecracker driver: %w", err)
	}
	b, err := bus.Connect(*natsURL, "host/"+cfg.Name)
	if err != nil {
		return err
	}
	defer b.Close()

	return host.New(cfg, drv, b, log).Run(ctx)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func userCacheDir() string {
	if dir, err := os.UserCacheDir(); err == nil {
		return dir
	}
	return os.TempDir()
}
