// Package server implements FunctionsService on top of the Postgres
// datastore, with hosts reached over the bus. It owns every decision that
// touches durable state; it never touches KVM or Docker.
package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"gocloud.dev/blob"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/galaxy-io/modules/secret"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/telemetry"
)

// Config tunes the service's limits and defaults.
type Config struct {
	// DefaultTimeout applies to versions whose spec leaves timeout_ms zero.
	DefaultTimeout time.Duration
	MaxTimeout     time.Duration
	// MaxPayloadBytes caps the size of an input and of an output.
	MaxPayloadBytes int
	DefaultVCPUs    uint32
	DefaultMemMiB   uint32
	BuildTimeout    time.Duration
	// GatherWindow is how long scatter/gather requests wait for hosts.
	GatherWindow time.Duration
	// HostTTL is how long a host stays listed after its last heartbeat.
	HostTTL time.Duration
	// InvokeDeadline is how long a call waits for its result when its caller
	// sets no deadline of its own, queued and running together.
	InvokeDeadline time.Duration
	// InvokeMaxDeadline caps the deadline a caller may set, and is how long
	// the queue keeps an invocation no host took.
	InvokeMaxDeadline time.Duration
	// InvokeReplicas is how many NATS servers keep each queued invocation.
	InvokeReplicas int
	// AsyncMaxAge is how long an async invocation may wait in the queue and
	// between its attempts. Past it, the host that takes it records it
	// canceled instead of running it.
	AsyncMaxAge time.Duration
	// RetryBackoff is how long an invocation waits after its first failed
	// attempt, five times longer after each one since, and at most
	// RetryBackoffMax.
	RetryBackoff    time.Duration
	RetryBackoffMax time.Duration
	// IdempotencyWindow is how long a call's idempotency key keeps later
	// calls with the same key from running again.
	IdempotencyWindow time.Duration
	// LogRetention is how long the bus keeps the latest lines of every
	// invocation's log, for live and recent reads. The log bucket keeps all
	// of it after that.
	LogRetention time.Duration
	// LogMaxBytes bounds what the bus keeps across all invocations; the
	// oldest lines go first.
	LogMaxBytes int64
	// Name is the server's identity on the bus; the hostname by default.
	Name string
	// InvocationRetention is how long the bus keeps an invocation record no
	// server has written yet, such as through a database outage.
	InvocationRetention time.Duration
	// InvocationReplicas is how many NATS servers keep each record.
	InvocationReplicas int
	// RuntimeImagePrefix is where the runtime images are, such that a
	// runtime's image is prefix/python:3.13.
	RuntimeImagePrefix string
	// RuntimeIconBaseURL is where the runtimes' icons are served from.
	RuntimeIconBaseURL string
}

// DefaultConfig returns the defaults server starts with.
func DefaultConfig() Config {
	return Config{
		DefaultTimeout:      30 * time.Second,
		MaxTimeout:          5 * time.Minute,
		MaxPayloadBytes:     64 << 20,
		DefaultVCPUs:        1,
		DefaultMemMiB:       128,
		BuildTimeout:        5 * time.Minute,
		GatherWindow:        500 * time.Millisecond,
		HostTTL:             10 * time.Second,
		InvokeDeadline:      5 * time.Minute,
		InvokeMaxDeadline:   time.Hour,
		InvokeReplicas:      1,
		AsyncMaxAge:         24 * time.Hour,
		RetryBackoff:        time.Second,
		RetryBackoffMax:     5 * time.Minute,
		IdempotencyWindow:   24 * time.Hour,
		LogRetention:        time.Hour,
		LogMaxBytes:         1 << 30,
		InvocationRetention: 24 * time.Hour,
		InvocationReplicas:  1,
		RuntimeImagePrefix:  "ghcr.io/galaxy-io/alchemy/runtime",
		RuntimeIconBaseURL:  "https://cdn.getgalaxy.io/sources",
	}
}

// maxRetryBackoff caps both retry backoff settings. A longer wait between
// attempts mostly outlives the deadline it has to fit in.
const maxRetryBackoff = time.Hour

// Validate rejects settings the service cannot run with.
func (c Config) Validate() error {
	switch {
	case c.RetryBackoff <= 0 || c.RetryBackoff > maxRetryBackoff:
		return fmt.Errorf("retry backoff %s must be over 0 and at most %s", c.RetryBackoff, maxRetryBackoff)
	case c.RetryBackoffMax < c.RetryBackoff || c.RetryBackoffMax > maxRetryBackoff:
		return fmt.Errorf("retry backoff max %s must be at least the retry backoff %s and at most %s", c.RetryBackoffMax, c.RetryBackoff, maxRetryBackoff)
	}
	return nil
}

// Service is the control plane. Any number of them run side by side.
// Functions and versions are in Postgres. Invocations are not written while
// they run: the server that accepted one holds it in memory until it ends,
// and its record reaches the database afterwards through the bus. What
// else lives in memory is a view every server keeps for itself: compiled
// contracts, and what hosts and the other servers last said about
// themselves.
type Service struct {
	functionsv1connect.UnimplementedFunctionsServiceHandler

	cfg       Config
	store     *postgres.Store
	bus       *bus.Bus
	logs      *blob.Bucket   // nil when function logs are kept on the bus only
	artifacts *blob.Bucket   // nil when functions are built from images only
	secrets   secret.Secrets // nil when the server has no secret provider
	log       *slog.Logger
	tracker   *invocationTracker // invocations this server holds
	queue     *bus.InvokeQueue
	metrics   *telemetry.Set

	// background scopes builds and subscriptions to the service's life.
	background context.Context
	stop       context.CancelFunc
	tasks      sync.WaitGroup
	subs       []*bus.Subscription

	mu       sync.Mutex
	versions map[string]*compiledVersion          // by version id
	hosts    map[string]*knownHost                // by host name, from heartbeats
	servers  map[string]*knownServer              // by server name, from heartbeats
	waiting  map[string]chan *hostv1.InvokeResult // results this server waits on, by invocation id
}

// compiledVersion is the in-memory half of a ready version. resolve sets
// timeout from the function on a copy for each call, so a change applies
// to the next invocation.
type compiledVersion struct {
	row      *sqlcgen.FunctionVersion
	spec     *functionsv1.FunctionSpec
	artifact *hostv1.Artifact
	timeout  time.Duration
	retries  int32
}

// New returns a service backed by store and b, reading function logs from
// logBucket and keeping the files of functions built from source in
// artifactBucket, either of which may be nil, and keeping tenant secrets in
// secrets, which may be nil too. It sets up the bus's streams, starts
// listening to hosts and other servers, and starts writing invocation
// records. It records metrics to metrics, which may be nil.
func New(ctx context.Context, cfg Config, store *postgres.Store, b *bus.Bus, logBucket, artifactBucket *blob.Bucket, secrets secret.Secrets, metrics *telemetry.Set, log *slog.Logger) (*Service, error) {
	bg, stop := context.WithCancel(context.Background())
	s := &Service{
		cfg:        cfg,
		store:      store,
		bus:        b,
		logs:       logBucket,
		artifacts:  artifactBucket,
		secrets:    secrets,
		log:        log,
		tracker:    newTracker(),
		metrics:    metrics,
		background: bg,
		stop:       stop,
		versions:   make(map[string]*compiledVersion),
		hosts:      make(map[string]*knownHost),
		servers:    make(map[string]*knownServer),
		waiting:    make(map[string]chan *hostv1.InvokeResult),
	}

	if err := b.EnsureLogStream(ctx, bus.LogStreamConfig{MaxAge: cfg.LogRetention, MaxBytes: cfg.LogMaxBytes}); err != nil {
		stop()
		return nil, fmt.Errorf("%w (NATS must have JetStream enabled)", err)
	}
	if err := b.EnsureInvocationStream(ctx, bus.InvocationStreamConfig{MaxAge: cfg.InvocationRetention, Replicas: cfg.InvocationReplicas}); err != nil {
		stop()
		return nil, err
	}
	if err := b.EnsureInvokeQueue(ctx, bus.InvokeQueueConfig{Replicas: cfg.InvokeReplicas, MaxAge: queueMaxAge(cfg), AckWait: invokeAckWait}); err != nil {
		stop()
		return nil, err
	}
	queue, err := b.InvokeQueue(ctx)
	if err != nil {
		stop()
		return nil, err
	}
	s.queue = queue
	if err := metrics.WatchQueue(queue.Depth); err != nil {
		stop()
		return nil, fmt.Errorf("watch invoke queue: %w", err)
	}
	metrics.Started(ctx, telemetry.Server)
	if err := s.syncFunctionConfigs(ctx); err != nil {
		stop()
		return nil, err
	}
	// A starting server has nothing in flight, so claims in its name that
	// were never marked with a host are a previous process's, lost between
	// claiming and sending. They are released before this name is live
	// again, or a retry would wait on them for the whole window.
	if n, err := store.ReleaseServerIdempotencyKeys(ctx, cfg.Name); err != nil {
		stop()
		return nil, fmt.Errorf("release idempotency keys: %w", err)
	} else if n > 0 {
		log.Info("released idempotency keys a previous process never sent", "count", n)
	}
	if err := s.listen(); err != nil {
		stop()
		return nil, err
	}
	s.tasks.Go(s.heartbeat)
	s.tasks.Go(s.record)
	s.tasks.Go(s.resumeBuilds)
	s.tasks.Go(s.expireKeys)
	return s, nil
}

// Close stops listening, cancels in-flight builds and waits for background
// work to finish.
func (s *Service) Close() {
	for _, sub := range s.subs {
		sub.Unsubscribe()
	}
	s.stop()
	s.tasks.Wait()
}

// compiled returns the in-memory half of a ready version, compiling the
// contract on first use. The artifact comes from the row: it was stored
// when the build finished.
func (s *Service) compiled(row *sqlcgen.FunctionVersion) (*compiledVersion, error) {
	s.mu.Lock()
	cv, ok := s.versions[row.ID]
	s.mu.Unlock()
	if ok {
		return cv, nil
	}

	spec, err := decodeSpec(row.Spec)
	if err != nil {
		return nil, err
	}
	artifact := &hostv1.Artifact{}
	if err := protojson.Unmarshal(row.Artifact, artifact); err != nil {
		return nil, fmt.Errorf("stored artifact: %w", err)
	}
	cv = &compiledVersion{row: row, spec: spec, artifact: artifact}
	s.mu.Lock()
	s.versions[row.ID] = cv
	s.mu.Unlock()
	return cv, nil
}

func decodeSpec(raw []byte) (*functionsv1.FunctionSpec, error) {
	spec := &functionsv1.FunctionSpec{}
	if err := protojson.Unmarshal(raw, spec); err != nil {
		return nil, fmt.Errorf("stored spec: %w", err)
	}
	return spec, nil
}

// notFound maps a missing row onto NOT_FOUND and anything else onto an
// internal error.
func notFound(err error, format string, args ...any) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return connect.NewError(connect.CodeNotFound, fmt.Errorf(format, args...))
	}
	return connect.NewError(connect.CodeInternal, err)
}
