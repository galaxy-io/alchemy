// Command server is the Galaxy Functions API: it owns Postgres, validates
// contracts, records invocations and reaches hosts over the bus. It needs
// neither KVM nor Docker.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"gocloud.dev/blob"

	"github.com/galaxy-io/modules/identity/auth/v1/authv1connect"
	"github.com/galaxy-io/modules/secret"

	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
	"github.com/galaxy-io/alchemy/api/metrics/v1/metricsv1connect"
	"github.com/galaxy-io/alchemy/cmd/internal/identity"
	"github.com/galaxy-io/alchemy/cmd/internal/logger"
	"github.com/galaxy-io/alchemy/cmd/internal/secrets"
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
	logsBucket := os.Getenv("LOGS_BUCKET")
	// Empty means functions are built from images only.
	artifactsBucket := os.Getenv("ARTIFACTS_BUCKET")
	if err := configure(&cfg); err != nil {
		return err
	}
	returnOrigins, err := ui.ParseReturnOrigins(os.Getenv("UI_RETURN_ORIGINS"))
	if err != nil {
		return fmt.Errorf("UI_RETURN_ORIGINS: %w", err)
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

	var artifacts *blob.Bucket
	if artifactsBucket == "" {
		log.Warn("no artifacts bucket: functions are built from images only")
	} else {
		if artifacts, err = blob.OpenBucket(ctx, artifactsBucket); err != nil {
			return fmt.Errorf("artifacts bucket: %w", err)
		}
		defer func() { _ = artifacts.Close() }()
	}

	provider, closeSecrets, err := secretProvider(ctx, store, log)
	if err != nil {
		return err
	}
	defer closeSecrets()

	// A nil authenticator leaves the API unauthenticated, in the default
	// tenant, and the UI renders without a session.
	auth, err := identity.FromEnv(ctx)
	if err != nil {
		return err
	}
	if closer, ok := auth.(io.Closer); ok {
		defer func() { _ = closer.Close() }()
	}

	svc, err := server.New(ctx, cfg, store, b, bucket, artifacts, provider, log)
	if err != nil {
		return err
	}
	defer svc.Close()

	// Unencrypted HTTP/2 lets gRPC clients connect without TLS.
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	srv := &http.Server{
		Addr:              addr,
		Handler:           routes(svc, server.AuthHandler(auth), server.NewAuthInterceptor(auth, store), ui.Config{ReturnOrigins: returnOrigins}),
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

// routes serves the API, and Invoke and GetInvocation over plain HTTP, behind one interceptor
// that authenticates both, and the UI rendered with uiConfig.
func routes(svc *server.Service, auth authv1connect.AuthServiceHandler, interceptor *server.AuthInterceptor, uiConfig ui.Config) *http.ServeMux {
	opts := connect.WithInterceptors(interceptor)
	mux := http.NewServeMux()
	mux.Handle(functionsv1connect.NewFunctionsServiceHandler(svc, opts))
	mux.Handle(metricsv1connect.NewMetricsServiceHandler(svc.NewMetricsService(), opts))
	mux.Handle(authv1connect.NewAuthServiceHandler(auth, opts))
	mux.Handle("POST /functions/{function}/invoke", interceptor.Handler(functionsv1connect.FunctionsServiceInvokeProcedure, http.HandlerFunc(svc.InvokeHTTP)))
	mux.Handle("GET /invocations/{id}", interceptor.Handler(functionsv1connect.FunctionsServiceGetInvocationProcedure, http.HandlerFunc(svc.GetInvocationHTTP)))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	// KEDA scales hosts on this (charts/alchemy, host.autoscaling).
	mux.HandleFunc("GET /scaling", func(w http.ResponseWriter, r *http.Request) {
		scaling, err := svc.Scaling(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(scaling)
	})
	mux.Handle("/", ui.Handler(uiConfig))
	return mux
}

// secretProvider is where tenant secrets are kept, or nil with a warning
// when the server has no key for them. close releases a provider's client,
// such as GCP's connection.
func secretProvider(ctx context.Context, store *postgres.Store, log *slog.Logger) (secret.Secrets, func(), error) {
	provider, err := secrets.FromEnv(ctx, store.Secrets(), server.SecretScope)
	if err != nil {
		return nil, nil, err
	}
	if provider == nil {
		log.Warn("no secret provider: ENCRYPTION_KEY is unset, so the secrets API is off")
	}
	closer, ok := provider.(io.Closer)
	if !ok {
		return provider, func() {}, nil
	}
	return provider, func() { _ = closer.Close() }, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// configure sets cfg from the environment.
func configure(cfg *server.Config) error {
	if s := os.Getenv("LOGS_RETENTION"); s != "" {
		d, err := time.ParseDuration(s)
		if err != nil {
			return fmt.Errorf("LOGS_RETENTION: %w", err)
		}
		cfg.LogRetention = d
	}
	if s := os.Getenv("LOGS_MAX_BYTES"); s != "" {
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return fmt.Errorf("LOGS_MAX_BYTES: %w", err)
		}
		cfg.LogMaxBytes = n
	}
	hostname, _ := os.Hostname()
	cfg.Name = envOr("SERVER_NAME", hostname)
	cfg.RuntimeImagePrefix = strings.TrimSuffix(envOr("RUNTIME_IMAGE_PREFIX", cfg.RuntimeImagePrefix), "/")
	cfg.RuntimeIconBaseURL = strings.TrimSuffix(envOr("RUNTIME_ICON_BASE_URL", cfg.RuntimeIconBaseURL), "/")
	if s := os.Getenv("IDEMPOTENCY_WINDOW"); s != "" {
		d, err := time.ParseDuration(s)
		if err != nil {
			return fmt.Errorf("IDEMPOTENCY_WINDOW: %w", err)
		}
		cfg.IdempotencyWindow = d
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
	for _, d := range []struct {
		key string
		v   *time.Duration
	}{
		{"INVOKE_DEADLINE", &cfg.InvokeDeadline},
		{"INVOKE_MAX_DEADLINE", &cfg.InvokeMaxDeadline},
		{"ASYNC_MAX_AGE", &cfg.AsyncMaxAge},
		{"RETRY_BACKOFF", &cfg.RetryBackoff},
		{"RETRY_BACKOFF_MAX", &cfg.RetryBackoffMax},
	} {
		if s := os.Getenv(d.key); s != "" {
			v, err := time.ParseDuration(s)
			if err != nil {
				return fmt.Errorf("%s: %w", d.key, err)
			}
			*d.v = v
		}
	}
	if s := os.Getenv("INVOKE_QUEUE_REPLICAS"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("INVOKE_QUEUE_REPLICAS: %w", err)
		}
		cfg.InvokeReplicas = n
	}
	return cfg.Validate()
}
