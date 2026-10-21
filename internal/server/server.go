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
	"sync/atomic"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"gocloud.dev/blob"
	"google.golang.org/protobuf/encoding/protojson"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/contract"
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
	// LogRetention is how long the bus keeps the latest lines of every
	// invocation's log, for live and recent reads. The log bucket keeps all
	// of it after that.
	LogRetention time.Duration
	// LogMaxBytes bounds what the bus keeps across all invocations; the
	// oldest lines go first.
	LogMaxBytes int64
}

// DefaultConfig returns the defaults server starts with.
func DefaultConfig() Config {
	return Config{
		DefaultTimeout:  30 * time.Second,
		MaxTimeout:      5 * time.Minute,
		MaxPayloadBytes: 64 << 20,
		DefaultVCPUs:    1,
		DefaultMemMiB:   128,
		BuildTimeout:    5 * time.Minute,
		GatherWindow:    500 * time.Millisecond,
		HostTTL:         10 * time.Second,
		LogRetention:    time.Hour,
		LogMaxBytes:     1 << 30,
	}
}

// Service is the control plane. Durable state is in Postgres; what lives in
// memory is per-process: compiled contracts, what hosts last said about
// themselves, and the event stream.
type Service struct {
	functionsv1connect.UnimplementedFunctionsServiceHandler

	cfg    Config
	store  *postgres.Store
	bus    *bus.Bus
	logs   *blob.Bucket // nil when function logs are kept on the bus only
	log    *slog.Logger
	tenant string
	events *eventBus

	// background scopes builds and subscriptions to the service's life.
	background context.Context
	stop       context.CancelFunc
	tasks      sync.WaitGroup
	subs       []*bus.Subscription

	mu         sync.Mutex
	versions   map[string]*compiledVersion // by version id
	hosts      map[string]*knownHost       // by host name, from heartbeats
	hostBuilds map[string]time.Time        // builds sent to one host, by host/artifact

	waiting atomic.Int64 // invocations held for a slot, see Scaling
}

// compiledVersion is the in-memory half of a ready version.
type compiledVersion struct {
	row      *sqlcgen.FunctionVersion
	spec     *functionsv1.FunctionSpec
	contract contract.Contract
	artifact *hostv1.Artifact
}

// New returns a service backed by store and b, reading function logs from
// logBucket when there is one. It sets up the bus's log stream, cancels
// invocations left active by a previous process, resumes interrupted builds
// and starts listening to hosts.
func New(ctx context.Context, cfg Config, store *postgres.Store, b *bus.Bus, logBucket *blob.Bucket, log *slog.Logger) (*Service, error) {
	bg, stop := context.WithCancel(context.Background())
	s := &Service{
		cfg:        cfg,
		store:      store,
		bus:        b,
		logs:       logBucket,
		log:        log,
		tenant:     postgres.DefaultTenantID,
		events:     newEventBus(),
		background: bg,
		stop:       stop,
		versions:   make(map[string]*compiledVersion),
		hosts:      make(map[string]*knownHost),
		hostBuilds: make(map[string]time.Time),
	}

	if err := b.EnsureLogStream(ctx, bus.LogStreamConfig{MaxAge: cfg.LogRetention, MaxBytes: cfg.LogMaxBytes}); err != nil {
		stop()
		return nil, fmt.Errorf("%w (NATS must have JetStream enabled)", err)
	}
	n, err := store.CancelStaleInvocations(ctx)
	if err != nil {
		stop()
		return nil, err
	}
	if n > 0 {
		log.Warn("canceled invocations left active by a previous process", "count", n)
	}
	if err := s.listen(); err != nil {
		stop()
		return nil, err
	}
	building, err := store.ListBuildingFunctionVersions(ctx)
	if err != nil {
		stop()
		return nil, err
	}
	for _, v := range building {
		log.Info("resuming build", "function_id", v.FunctionID, "version", v.Version)
		s.startBuild(v)
	}
	s.tasks.Go(s.reconcileHosts)
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
	c, err := contract.Compile(spec.GetContract())
	if err != nil {
		return nil, err
	}
	artifact := &hostv1.Artifact{}
	if err := protojson.Unmarshal(row.Artifact, artifact); err != nil {
		return nil, fmt.Errorf("stored artifact: %w", err)
	}
	cv = &compiledVersion{row: row, spec: spec, contract: c, artifact: artifact}
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
