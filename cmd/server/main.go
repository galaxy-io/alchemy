// Command server is the Galaxy Functions API: it owns Postgres, validates
// contracts, records invocations and reaches hosts over the bus. It needs
// neither KVM nor Docker.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
	"github.com/galaxy-io/alchemy/api/metrics/v1/metricsv1connect"
	"github.com/galaxy-io/alchemy/cmd/internal/logger"
	"github.com/galaxy-io/alchemy/datastore/postgres"
	"github.com/galaxy-io/alchemy/internal/bus"
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

	addr := flag.String("addr", ":8780", "address to serve the API on")
	dsn := flag.String("dsn", envOr("PERSISTENCE_DSN", "postgresql://alchemy:alchemy@localhost:5435/alchemy?sslmode=disable"), "Postgres DSN (env PERSISTENCE_DSN)")
	natsURL := flag.String("nats", envOr("NATS_URL", "nats://localhost:4223"), "NATS URL (env NATS_URL)")
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	store, err := postgres.Open(ctx, *dsn)
	if err != nil {
		return err
	}
	defer store.Close()
	if err := store.Migrate(ctx); err != nil {
		return err
	}

	b, err := bus.Connect(*natsURL, "server")
	if err != nil {
		return err
	}
	defer b.Close()

	svc, err := server.New(ctx, cfg, store, b, log)
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
	mux.Handle("/", ui.Handler())

	// Unencrypted HTTP/2 lets gRPC clients connect without TLS.
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		Protocols:         protocols,
		ReadHeaderTimeout: 10 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.ListenAndServe() }()
	log.Info("server listening", "addr", *addr, "nats", *natsURL)

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
