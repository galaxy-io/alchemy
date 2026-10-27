// Command server is the Galaxy Functions API: it owns Postgres, validates
// contracts, records invocations and reaches hosts over the bus. It needs
// neither KVM nor Docker.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
	"github.com/galaxy-io/alchemy/api/metrics/v1/metricsv1connect"
	"github.com/galaxy-io/alchemy/cmd/internal/logger"
	"github.com/galaxy-io/alchemy/datastore/postgres"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/logs"
	"github.com/galaxy-io/alchemy/internal/server"
	"github.com/galaxy-io/alchemy/ui"
)

func main() {
	log, err := logger.New(os.Stdout)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if err := run(log); err != nil {
		log.Error("server", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg := server.DefaultConfig()

	addr := envOr("ADDR", ":8780")
	dsn := envOr("PERSISTENCE_DSN", "postgresql://alchemy:alchemy@localhost:5435/alchemy?sslmode=disable")
	natsURL := envOr("NATS_URL", "nats://localhost:4223")
	// Empty keeps function logs on NATS only.
	logsBucket := os.Getenv("FUNCTION_LOGS_BUCKET")
	if err := configure(&cfg); err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	store, err := postgres.Open(ctx, dsn)
	if err != nil {
		return err
	}
	defer store.Close()
	if err := store.Migrate(ctx); err != nil {
		return err
	}

	b, err := bus.Connect(natsURL, "server")
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

	svc, err := server.New(ctx, cfg, store, b, bucket, log)
	if err != nil {
		return err
	}
	defer svc.Close()

	mux := http.NewServeMux()
	mux.Handle(functionsv1connect.NewFunctionsServiceHandler(svc))
	mux.Handle(metricsv1connect.NewMetricsServiceHandler(svc.NewMetricsService()))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	// KEDA scales hosts on this (charts/alchemy, host.autoscaling).
	mux.HandleFunc("GET /scaling", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(svc.Scaling())
	})
	mux.Handle("/", ui.Handler())

	// Unencrypted HTTP/2 lets gRPC clients connect without TLS.
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		Protocols:         protocols,
		ReadHeaderTimeout: 10 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.ListenAndServe() }()
	log.Info("server listening", "addr", addr, "nats", natsURL)

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// configure sets cfg from the environment.
func configure(cfg *server.Config) error {
	if s := os.Getenv("FUNCTION_LOGS_RETENTION"); s != "" {
		d, err := time.ParseDuration(s)
		if err != nil {
			return fmt.Errorf("FUNCTION_LOGS_RETENTION: %w", err)
		}
		cfg.LogRetention = d
	}
	if s := os.Getenv("FUNCTION_LOGS_MAX_BYTES"); s != "" {
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return fmt.Errorf("FUNCTION_LOGS_MAX_BYTES: %w", err)
		}
		cfg.LogMaxBytes = n
	}
	hostname, _ := os.Hostname()
	cfg.Name = envOr("SERVER_NAME", hostname)
	if s := os.Getenv("IDEMPOTENCY_WINDOW"); s != "" {
		d, err := time.ParseDuration(s)
		if err != nil {
			return fmt.Errorf("IDEMPOTENCY_WINDOW: %w", err)
		}
		cfg.IdempotencyWindow = d
	}
	if s := os.Getenv("HOSTS_PER_FUNCTION"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 {
			return fmt.Errorf("HOSTS_PER_FUNCTION: want a positive integer, got %q", s)
		}
		cfg.HostsPerFunction = n
	}
	if s := os.Getenv("INVOCATION_STREAM_RETENTION"); s != "" {
		d, err := time.ParseDuration(s)
		if err != nil {
			return fmt.Errorf("INVOCATION_STREAM_RETENTION: %w", err)
		}
		cfg.InvocationRetention = d
	}
	if s := os.Getenv("INVOCATION_STREAM_REPLICAS"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("INVOCATION_STREAM_REPLICAS: %w", err)
		}
		cfg.InvocationReplicas = n
	}
	return nil
}
