// Package host is the per-machine process: it builds artifacts, runs
// instances and serves invocations over the bus. It holds nothing durable
// beyond the records of invocations it has not published yet; if it dies,
// its instances die with it and the server records the invocations it was
// serving as errored.
package host

import (
	"cmp"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"sort"
	"sync"
	"time"

	"gocloud.dev/blob"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/contract"
	"github.com/galaxy-io/alchemy/internal/driver"
	"github.com/galaxy-io/alchemy/internal/logs"
)

const (
	// supervisorGrace is how long past the function's timeout the host waits
	// for the supervisor to report it before giving up on the instance.
	supervisorGrace = 5 * time.Second
	releaseTimeout  = 30 * time.Second
)

// Config tunes one host.
type Config struct {
	// Name is the host's identity on the bus; the hostname by default.
	Name string
	// MaxConcurrency is how many invocations may hold an instance at once.
	MaxConcurrency int
	// MemoryMiB is the guest memory this host may commit across booting,
	// busy and warm instances; 0 means no limit. Warm instances are evicted,
	// least recently used first, to make room for a cold boot.
	MemoryMiB int64
	// WarmTTL is how long a finished instance stays booted for the next
	// invocation of the same artifact. 0 releases every instance after one
	// invocation, so every start is a cold boot.
	WarmTTL time.Duration
	// Prewarm is how many idle instances the host keeps booted for every
	// artifact it serves, so even the first invocation skips the boot. They
	// are booted from free memory only, never by evicting other instances,
	// and the warm TTL never takes an artifact below this many.
	Prewarm int
	// KeptVersions is how many of a function's newest versions this host
	// has built stay built whatever their use. The rest are evicted once
	// idle for VersionIdleTTL: the host stops serving them and drops their
	// snapshot and drives, and the next invocation builds again. 0 for the
	// TTL keeps every version.
	KeptVersions   int
	VersionIdleTTL time.Duration
	// SecretsRefresh is how long a fetched secret value is used before the
	// host asks a server for it again.
	SecretsRefresh    time.Duration
	BuildTimeout      time.Duration
	HeartbeatInterval time.Duration
}

// DefaultConfig returns the defaults a host starts with.
func DefaultConfig() Config {
	return Config{
		MaxConcurrency:    8,
		WarmTTL:           5 * time.Minute,
		KeptVersions:      2,
		VersionIdleTTL:    24 * time.Hour,
		SecretsRefresh:    5 * time.Minute,
		BuildTimeout:      5 * time.Minute,
		HeartbeatInterval: 2 * time.Second,
	}
}

// Host serves one machine's capacity on the bus.
type Host struct {
	cfg       Config
	driver    driver.Driver
	bus       *bus.Bus
	logs      *blob.Bucket // nil keeps function logs on the bus only
	layers    *blob.Bucket // nil means builds with layers fail
	log       *slog.Logger
	startedAt time.Time
	slots     chan struct{}

	// background outlives any one request: instance teardown and the
	// subscriptions run on it.
	background context.Context
	stop       context.CancelFunc
	tasks      sync.WaitGroup

	records   *recordQueue
	contracts *contractCache
	secrets   secretCache

	// drives orders builds against eviction. A build holds it shared from
	// the driver's Build until it serves the artifact, and eviction holds it
	// alone from choosing what to keep until Forget is done, so Forget never
	// removes a drive a build has found and is about to serve.
	drives sync.RWMutex

	// handlers counts the bus handlers running. Shutdown waits for them
	// before it waits for tasks, so no handler starts a task after that.
	handlers sync.WaitGroup

	mu        sync.Mutex
	artifacts map[string]*hostv1.Artifact // built and ready to run, by id
	used      map[string]time.Time        // when each artifact was built or last invoked, by id
	instances map[string]*liveInstance    // every instance, by key
	warm      map[string][]*liveInstance  // idle instances by artifact id, most recently used last
	draining  bool                        // shutting down: nothing more is parked
	filling   map[string]int              // prewarm boots in flight, by artifact id
}

// New returns a host that is not yet serving; Run starts it. Function logs
// are uploaded to logBucket, when there is one. Builds read their layers
// from artifactBucket.
func New(cfg Config, d driver.Driver, b *bus.Bus, logBucket, artifactBucket *blob.Bucket, log *slog.Logger) *Host {
	bg, stop := context.WithCancel(context.Background())
	return &Host{
		cfg:        cfg,
		driver:     d,
		bus:        b,
		logs:       logBucket,
		layers:     artifactBucket,
		log:        log,
		startedAt:  time.Now(),
		slots:      make(chan struct{}, cfg.MaxConcurrency),
		records:    newRecordQueue(b, log),
		contracts:  newContractCache(),
		secrets:    secretCache{values: make(map[string]cachedSecret)},
		background: bg,
		stop:       stop,
		artifacts:  make(map[string]*hostv1.Artifact),
		used:       make(map[string]time.Time),
		instances:  make(map[string]*liveInstance),
		warm:       make(map[string][]*liveInstance),
		filling:    make(map[string]int),
	}
}

// Run subscribes to the host subjects and heartbeats until ctx ends, then
// tears down what is still running.
func (h *Host) Run(ctx context.Context) error {
	subs := []*bus.Subscription{}
	for _, s := range []struct {
		subject, queue string
		handler        bus.Handler
		refused        proto.Message // the reply once the host is shutting down
	}{
		// The server places functions on hosts: it sends this host the builds
		// and the invocations it chose it for.
		{bus.HostBuildSubject(h.cfg.Name), "", h.handleBuild, buildError("unavailable", errShuttingDown)},
		{bus.HostInvokeSubject(h.cfg.Name), "", h.handleInvoke, invokeError("unavailable", errShuttingDown)},
		{bus.DescribeSubject, "", h.handleDescribe, nil},
		{bus.InstancesSubject, "", h.handleInstances, nil},
		{bus.HostSecretsInvalidateSubject, "", h.handleSecretsInvalidate, nil},
	} {
		sub, err := h.bus.Serve(h.background, s.subject, s.queue, h.tracked(s.handler, s.refused))
		if err != nil {
			return err
		}
		subs = append(subs, sub)
	}
	// Records outlive the background context: invocations cancelled at
	// shutdown still record how they ended.
	records, stopRecords := context.WithCancel(context.WithoutCancel(h.background))
	defer stopRecords()
	h.tasks.Go(func() { h.records.run(records) })
	h.log.Info("host serving", "slots", h.cfg.MaxConcurrency, "memory_mib", h.cfg.MemoryMiB, "warm_ttl", h.cfg.WarmTTL, "prewarm", h.cfg.Prewarm, "kept_versions", h.cfg.KeptVersions, "version_idle_ttl", h.cfg.VersionIdleTTL)

	ticker := time.NewTicker(h.cfg.HeartbeatInterval)
	defer ticker.Stop()
	h.heartbeat()
	for {
		select {
		case <-ticker.C:
			h.expireWarm(time.Now())
			h.evictVersions(time.Now())
			h.heartbeat()
		case <-ctx.Done():
			for _, s := range subs {
				s.Unsubscribe()
			}
			h.shutdown(stopRecords)
			return nil
		}
	}
}

var errShuttingDown = errors.New("host is shutting down")

// shutdownGrace is how long in-flight builds and invocations get to finish
// once the host stops taking work, inside the chart's termination grace.
const shutdownGrace = 40 * time.Second

// tracked counts handler's runs in h.handlers, so shutdown can wait for
// them, and answers refused instead once the host is draining.
func (h *Host) tracked(handler bus.Handler, refused proto.Message) bus.Handler {
	return func(ctx context.Context, data []byte) proto.Message {
		h.mu.Lock()
		if h.draining {
			h.mu.Unlock()
			return refused
		}
		h.handlers.Add(1)
		h.mu.Unlock()
		defer h.handlers.Done()
		return handler(ctx, data)
	}
}

// shutdown stops taking work and releases the warm pool, gives in-flight
// builds and invocations shutdownGrace to finish, then cancels them, so
// every instance is released before Run returns and no microVM outlives
// the host. stopRecords ends the record queue once every handler has
// queued its record, and the queue publishes what is left.
func (h *Host) shutdown(stopRecords context.CancelFunc) {
	h.drainWarm()
	done := make(chan struct{})
	go func() {
		h.handlers.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(shutdownGrace):
		h.log.Warn("shutdown grace over, cancelling in-flight work")
	}
	h.stop()
	<-done
	stopRecords()
	h.tasks.Wait()
}

func (h *Host) heartbeat() {
	if err := h.bus.Publish(bus.HeartbeatSubject(h.cfg.Name), &hostv1.Heartbeat{Host: h.describe(), Artifacts: h.artifactStates()}); err != nil {
		h.log.Warn("heartbeat", "err", err)
	}
}

// artifactStates is what this host holds of every artifact it has built:
// the instances waiting for an invocation and those busy with one.
func (h *Host) artifactStates() []*hostv1.ArtifactState {
	h.mu.Lock()
	defer h.mu.Unlock()
	states := make(map[string]*hostv1.ArtifactState, len(h.artifacts))
	out := make([]*hostv1.ArtifactState, 0, len(h.artifacts))
	for id := range h.artifacts {
		st := &hostv1.ArtifactState{Id: id}
		states[id] = st
		out = append(out, st)
	}
	for _, live := range h.instances {
		st, ok := states[live.artifact.GetId()]
		if !ok {
			continue
		}
		switch live.statusNow() {
		case functionsv1.InstanceStatus_INSTANCE_STATUS_READY:
			st.Idle++
		case functionsv1.InstanceStatus_INSTANCE_STATUS_BOOTING, functionsv1.InstanceStatus_INSTANCE_STATUS_BUSY:
			st.Busy++
		default:
		}
	}
	return out
}

// handleBuild builds an artifact and starts taking invocations for it.
func (h *Host) handleBuild(ctx context.Context, data []byte) proto.Message {
	req := &hostv1.BuildRequest{}
	if err := proto.Unmarshal(data, req); err != nil {
		return buildError("invalid_argument", err)
	}
	ctx, cancel := context.WithTimeout(ctx, h.cfg.BuildTimeout)
	defer cancel()
	start := time.Now()
	layers, err := h.driverLayers(req.GetLayers())
	if err != nil {
		return buildError("failed_precondition", err)
	}
	h.drives.RLock()
	defer h.drives.RUnlock()
	built, err := h.driver.Build(ctx, req.GetSpec(), layers)
	if err != nil {
		h.log.Warn("build failed", "image", req.GetSpec().GetImage(), "err", err)
		return &hostv1.BuildResponse{Result: &hostv1.BuildResponse_Error{Error: &hostv1.Error{Code: "internal", Message: err.Error()}}, BuildLog: err.Error()}
	}
	artifact := toProto(req, built)
	if err := h.driver.Snapshot(ctx, fromProto(artifact)); err != nil {
		h.log.Warn("snapshot failed", "artifact_id", artifact.GetId(), "err", err)
		return &hostv1.BuildResponse{Result: &hostv1.BuildResponse_Error{Error: &hostv1.Error{Code: "internal", Message: "snapshot: " + err.Error()}}, BuildLog: err.Error()}
	}
	h.serve(artifact)
	h.prewarm(artifact)
	h.log.Info("build ready", "artifact_id", artifact.GetId(), "digest", artifact.GetDigest(), "took", time.Since(start).Round(time.Millisecond))
	return &hostv1.BuildResponse{Result: &hostv1.BuildResponse_Artifact{Artifact: artifact}}
}

// driverLayers reads layers from the artifact bucket.
func (h *Host) driverLayers(layers []*hostv1.Layer) ([]driver.Layer, error) {
	if len(layers) > 0 && h.layers == nil {
		return nil, errors.New("the build has layers and this host has no artifact bucket")
	}
	out := make([]driver.Layer, len(layers))
	for i, l := range layers {
		out[i] = driver.Layer{
			SHA256: l.GetSha256(),
			Open: func(ctx context.Context) (io.ReadCloser, error) {
				return h.layers.NewReader(ctx, l.GetKey(), nil)
			},
		}
	}
	return out, nil
}

func buildError(code string, err error) *hostv1.BuildResponse {
	return &hostv1.BuildResponse{Result: &hostv1.BuildResponse_Error{Error: &hostv1.Error{Code: code, Message: err.Error()}}}
}

// serve marks an artifact ready: this host takes its invocations and
// reports it in heartbeats, which is how the servers learn to send them.
func (h *Host) serve(a *hostv1.Artifact) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.artifacts[a.GetId()] = a
	h.used[a.GetId()] = time.Now()
}

// serving reports whether this host has built artifact id, and counts the
// use.
func (h *Host) serving(id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, ok := h.artifacts[id]
	if ok {
		h.used[id] = time.Now()
	}
	return ok
}

// evictVersions stops serving every artifact beyond a function's newest
// KeptVersions that has gone VersionIdleTTL without an invocation, releases
// its warm instances and drops what the driver kept for it. Busy instances
// finish on what their jail holds. While a build is running it waits for
// the next tick rather than holding up the heartbeat.
func (h *Host) evictVersions(now time.Time) {
	if h.cfg.VersionIdleTTL <= 0 {
		return
	}
	if !h.drives.TryLock() {
		return
	}
	defer h.drives.Unlock()
	cutoff := now.Add(-h.cfg.VersionIdleTTL)
	h.mu.Lock()
	byFunction := make(map[string][]*hostv1.Artifact)
	for _, a := range h.artifacts {
		key := a.GetTenantId() + "/" + a.GetFunctionId()
		byFunction[key] = append(byFunction[key], a)
	}
	var evicted []*hostv1.Artifact
	var idle []*liveInstance
	for _, versions := range byFunction {
		slices.SortFunc(versions, func(a, b *hostv1.Artifact) int { return cmp.Compare(b.GetVersion(), a.GetVersion()) })
		for i, a := range versions {
			if i < h.cfg.KeptVersions || !h.used[a.GetId()].Before(cutoff) {
				continue
			}
			delete(h.artifacts, a.GetId())
			delete(h.used, a.GetId())
			idle = append(idle, h.warm[a.GetId()]...)
			delete(h.warm, a.GetId())
			evicted = append(evicted, a)
		}
	}
	keep := make([]*driver.Artifact, 0, len(h.artifacts))
	for _, a := range h.artifacts {
		keep = append(keep, fromProto(a))
	}
	h.mu.Unlock()
	for _, live := range idle {
		h.release(live)
	}
	for _, a := range evicted {
		if err := h.driver.Forget(h.background, fromProto(a), keep); err != nil {
			h.log.Warn("forget artifact", "artifact_id", a.GetId(), "err", err)
		}
		h.log.Info("evicted version", "artifact_id", a.GetId(), "function_id", a.GetFunctionId(), "version", a.GetVersion())
	}
}

// Keeping one output in the bucket is on the reply path, so its attempts
// stay inside the grace the server gives a host.
const (
	outputUploadTimeout  = 10 * time.Second
	outputUploadAttempts = 3
	outputUploadBackoff  = 500 * time.Millisecond
)

// handleInvoke runs one input through an instance. Every reply is an
// InvokeResponse; an Error result means no instance ran the input. When an
// instance ran it, the host publishes the invocation's record as well: the
// reply tells the caller, the record tells the database.
func (h *Host) handleInvoke(ctx context.Context, data []byte) proto.Message {
	req := &hostv1.InvokeRequest{}
	if err := proto.Unmarshal(data, req); err != nil {
		return invokeError("invalid_argument", err)
	}
	id := req.GetInvocation().GetId()
	log := h.log.With("invocation_id", id, "artifact_id", req.GetArtifact().GetId())
	start := time.Now()
	if !h.serving(req.GetArtifact().GetId()) {
		// The server's view of this host is stale; it builds here and retries.
		return invokeError("not_found", errors.New("artifact is not built on this host"))
	}

	// Check the input before taking a slot: a rejected input costs no
	// capacity, and it is the caller's mistake, so it ends here.
	c, input, rejected := h.checkInput(req, start)
	if rejected != nil {
		return rejected
	}

	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		return invokeError("resource_exhausted", errors.New("host is at capacity"))
	}

	h.publishState(req, functionsv1.InvocationStatus_INVOCATION_STATUS_STARTING, "", functionsv1.StartKind_START_KIND_UNSPECIFIED, 0)
	live, err := h.admit(req.GetArtifact())
	if err != nil {
		return invokeError("resource_exhausted", err)
	}
	instance, startKind := live.instance, functionsv1.StartKind_START_KIND_WARM
	if instance == nil {
		instance, startKind, err = h.driver.Acquire(ctx, fromProto(req.GetArtifact()))
		if err != nil {
			h.untrack(live)
			log.Warn("acquire instance", "err", err)
			return invokeError("unavailable", fmt.Errorf("acquire instance: %w", err))
		}
	}
	live.ready(instance, startKind, id)
	// An instance whose supervisor answered can take the next invocation;
	// one that stopped answering, or any instance when warm reuse is off, is
	// released. Neither must delay the reply.
	reusable := false
	defer func() {
		if reusable && h.park(live) {
			return
		}
		h.release(live)
	}()
	acquired := time.Now()
	acquireUs := acquired.Sub(start).Microseconds()
	h.publishState(req, functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING, instance.ID(), startKind, acquireUs)

	resp := &hostv1.InvokeResponse{
		InstanceId: instance.ID(),
		StartKind:  startKind,
		AcquireUs:  acquireUs,
	}
	timeout := time.Duration(req.GetTimeoutMs()) * time.Millisecond
	runCtx, cancel := context.WithTimeout(ctx, timeout+supervisorGrace)
	defer cancel()
	secrets, rejected := h.invocationSecrets(runCtx, req.GetArtifact(), log)
	if rejected != nil {
		reusable = true
		return rejected
	}
	fnLogs := h.functionLogs(req, log)
	out, err := instance.Invoke(runCtx, &supervisorv1.InvokeRequest{
		InvocationId: id,
		Input:        input.Wire,
		TimeoutMs:    timeout.Milliseconds(),
		HostTimeMs:   time.Now().UnixMilli(),
		Env:          secrets,
	}, fnLogs)
	fnLogs.end()
	switch {
	case err == nil:
		reusable = true
		if f := out.GetFailure(); f != nil {
			resp.Result = &hostv1.InvokeResponse_FunctionError{FunctionError: functionError(f)}
		} else {
			checkOutput(resp, c, input, out.GetOutput(), req.GetMaxOutputBytes())
			h.keepOutput(req.GetOutputKey(), resp.GetOutput(), log)
		}
		resp.RunUs = cmpNonZero(out.GetRunUs(), time.Since(acquired).Microseconds())
	case errors.Is(runCtx.Err(), context.DeadlineExceeded):
		// The supervisor never answered; the function is the likeliest cause.
		resp.Result = &hostv1.InvokeResponse_FunctionError{FunctionError: &functionsv1.FunctionError{
			Kind:    functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_TIMEOUT,
			Message: fmt.Sprintf("function exceeded its %dms timeout and the instance stopped responding", timeout.Milliseconds()),
		}}
		resp.RunUs = time.Since(acquired).Microseconds()
	default:
		// The instance stopped answering after it took the input, so the
		// function may have run: aborted, not unavailable, tells the server
		// the outcome is unknown rather than that nothing happened.
		log.Warn("invoke instance", "instance_id", instance.ID(), "err", err)
		return invokeError("aborted", fmt.Errorf("invoke instance: %w", err))
	}
	log.Debug("invocation finished", "instance_id", instance.ID(), "start_kind", startKind, "acquire_us", acquireUs, "run_us", resp.GetRunUs())
	h.records.add(record(h.cfg.Name, req.GetInvocation(), resp, start, acquired))
	return resp
}

// checkInput compiles the artifact's contract and checks the input against
// it. A rejection is the reply to send, already recorded; nothing ran.
func (h *Host) checkInput(req *hostv1.InvokeRequest, start time.Time) (contract.Contract, *contract.Input, proto.Message) {
	c, err := h.contracts.get(req.GetArtifact().GetContract())
	if err != nil {
		return nil, nil, invokeError("failed_precondition", fmt.Errorf("compile contract: %w", err))
	}
	input, violations, err := c.EncodeInput(req.GetInput())
	if err != nil {
		return nil, nil, invokeError("internal", fmt.Errorf("encode input: %w", err))
	}
	if len(violations) == 0 {
		return c, input, nil
	}
	resp := &hostv1.InvokeResponse{Result: &hostv1.InvokeResponse_FunctionError{FunctionError: &functionsv1.FunctionError{
		Kind:       functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_INPUT_INVALID,
		Message:    "input violates the version's input schema",
		Violations: violations,
	}}}
	h.records.add(record(h.cfg.Name, req.GetInvocation(), resp, start, time.Time{}))
	return nil, nil, resp
}

// checkOutput sets resp's result from raw, enforcing the output side of the
// contract and the size limit (0: unbounded). What it sets is what the
// caller receives.
func checkOutput(resp *hostv1.InvokeResponse, c contract.Contract, input *contract.Input, raw []byte, maxBytes int64) {
	fail := func(message string, violations []*functionsv1.ContractViolation) {
		resp.Result = &hostv1.InvokeResponse_FunctionError{FunctionError: &functionsv1.FunctionError{
			Kind:       functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_OUTPUT_INVALID,
			Message:    message,
			Violations: violations,
		}}
	}
	if maxBytes > 0 && int64(len(raw)) > maxBytes {
		fail(fmt.Sprintf("output is %d bytes; the limit is %d", len(raw), maxBytes), nil)
		return
	}
	checked, violations, err := c.DecodeOutput(input, raw)
	switch {
	case err != nil:
		fail(fmt.Sprintf("output could not be decoded: %v", err), nil)
	case len(violations) > 0:
		fail("output violates the version's contract", violations)
	default:
		resp.Result = &hostv1.InvokeResponse_Output{Output: checked}
	}
}

// keepOutput stores a checked output in the bucket at key before the host
// replies, so that a reply means the output is there for a server to
// replay. Only keyed calls ask for it and pay the upload. An upload that
// keeps failing is given up on: the caller still gets its result, and a
// retry finds no output and learns the key is held.
func (h *Host) keepOutput(key string, out []byte, log *slog.Logger) {
	if key == "" || h.logs == nil {
		return
	}
	ctx, cancel := context.WithTimeout(h.background, outputUploadTimeout)
	defer cancel()
	var err error
	for attempt := 0; attempt < outputUploadAttempts && ctx.Err() == nil; attempt++ {
		if err = logs.WriteOutput(ctx, h.logs, key, out); err == nil {
			return
		}
		select {
		case <-ctx.Done():
		case <-time.After(outputUploadBackoff):
		}
	}
	log.Error("output was not kept; a retry of its idempotency key cannot replay it", "key", key, "err", err)
}

// functionError is a supervisor failure as the caller sees it.
func functionError(f *supervisorv1.Failure) *functionsv1.FunctionError {
	fe := &functionsv1.FunctionError{Message: f.GetMessage(), Type: f.GetType()}
	switch f.GetKind() {
	case supervisorv1.FailureKind_FAILURE_KIND_RAISED:
		fe.Kind = functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_RAISED
	case supervisorv1.FailureKind_FAILURE_KIND_TIMEOUT:
		fe.Kind = functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_TIMEOUT
	default:
		fe.Kind = functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_CRASHED
	}
	return fe
}

// functionLog is where one invocation's stderr goes: the bus, and the log
// bucket.
type functionLog struct {
	*logs.Writer
	h       *Host
	subject string
	log     *slog.Logger
}

func (h *Host) functionLogs(req *hostv1.InvokeRequest, log *slog.Logger) *functionLog {
	tenantID := req.GetArtifact().GetTenantId()
	subject := bus.LogSubject(tenantID, req.GetInvocation().GetId())
	w := logs.NewWriter(h.background, h.logs, req.GetLogKey(),
		func(p []byte) error { return h.bus.PublishLog(subject, p) }, log)
	return &functionLog{Writer: w, h: h, subject: subject, log: log}
}

// end marks the log complete on the bus, then completes the upload without
// holding up the reply.
func (l *functionLog) end() {
	if err := l.h.bus.EndLog(l.subject); err != nil {
		l.log.Debug("end log", "err", err)
	}
	l.h.tasks.Go(func() {
		if err := l.Close(); err != nil {
			l.log.Warn("complete log upload", "err", err)
		}
	})
}

func invokeError(code string, err error) *hostv1.InvokeResponse {
	return &hostv1.InvokeResponse{Result: &hostv1.InvokeResponse_Error{Error: &hostv1.Error{Code: code, Message: err.Error()}}}
}

// publishState tells the server that sent req how its invocation is doing.
func (h *Host) publishState(req *hostv1.InvokeRequest, status functionsv1.InvocationStatus, instanceID string, kind functionsv1.StartKind, acquireUs int64) {
	if req.GetStateSubject() == "" {
		return
	}
	err := h.bus.Publish(req.GetStateSubject(), &hostv1.InvocationEvent{
		InvocationId: req.GetInvocation().GetId(),
		Status:       status,
		InstanceId:   instanceID,
		StartKind:    kind,
		AcquireUs:    acquireUs,
	})
	if err != nil {
		h.log.Warn("publish invocation state", "invocation_id", req.GetInvocation().GetId(), "err", err)
	}
}

// admit claims an instance for one invocation of a: a warm one if a has
// any, otherwise room in the memory budget for a cold boot, evicting warm
// instances of other artifacts, least recently used first, when needed. A
// returned instance with no driver instance is booting and must be acquired.
func (h *Host) admit(a *hostv1.Artifact) (*liveInstance, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if idle := h.warm[a.GetId()]; len(idle) > 0 {
		live := idle[len(idle)-1]
		h.warm[a.GetId()] = idle[:len(idle)-1]
		h.prewarmLocked(a)
		return live, nil
	}
	need := int64(a.GetMemoryMib())
	for h.cfg.MemoryMiB > 0 && h.committedLocked()+need > h.cfg.MemoryMiB {
		victim := h.oldestWarmLocked()
		if victim == nil {
			return nil, fmt.Errorf("host memory is committed (%d of %d MiB)", h.committedLocked(), h.cfg.MemoryMiB)
		}
		h.unwarmLocked(victim)
		delete(h.instances, victim.key)
		h.tasks.Go(func() { h.kill(victim) })
	}
	return h.trackLocked(a), nil
}

// park returns live to the warm pool for its artifact. It reports false
// when warm reuse is off, the host is draining or the artifact was evicted,
// and the caller releases the instance instead.
func (h *Host) park(live *liveInstance) bool {
	if h.cfg.WarmTTL <= 0 {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, served := h.artifacts[live.artifact.GetId()]; h.draining || !served {
		return false
	}
	live.idle(time.Now())
	h.warm[live.artifact.GetId()] = append(h.warm[live.artifact.GetId()], live)
	return true
}

// drainWarm stops parking and releases every warm instance.
func (h *Host) drainWarm() {
	h.mu.Lock()
	h.draining = true
	var all []*liveInstance
	for _, idle := range h.warm {
		all = append(all, idle...)
	}
	h.warm = make(map[string][]*liveInstance)
	h.mu.Unlock()
	for _, live := range all {
		h.release(live)
	}
}

// release tears live down in the background. The memory it frees goes to
// topping its artifact's prewarm pool back up.
func (h *Host) release(live *liveInstance) {
	live.releasing()
	h.tasks.Go(func() {
		h.kill(live)
		h.untrack(live)
		h.prewarm(live.artifact)
	})
}

func (h *Host) kill(live *liveInstance) {
	ctx, cancel := context.WithTimeout(h.background, releaseTimeout)
	defer cancel()
	live.instance.Release(ctx)
}

// expireWarm releases warm instances idle since before now minus WarmTTL.
func (h *Host) expireWarm(now time.Time) {
	cutoff := now.Add(-h.cfg.WarmTTL)
	h.mu.Lock()
	var expired []*liveInstance
	for id, idle := range h.warm {
		// The newest Prewarm instances stay however long they have idled.
		keepFrom := len(idle) - h.cfg.Prewarm
		kept := idle[:0]
		for i, live := range idle {
			if i < keepFrom && live.lastUsed().Before(cutoff) {
				expired = append(expired, live)
			} else {
				kept = append(kept, live)
			}
		}
		if len(kept) == 0 {
			delete(h.warm, id)
		} else {
			h.warm[id] = kept
		}
	}
	h.mu.Unlock()
	for _, live := range expired {
		h.release(live)
	}
}

// prewarm tops a's warm pool up to Prewarm idle instances in the background.
func (h *Host) prewarm(a *hostv1.Artifact) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.prewarmLocked(a)
}

func (h *Host) prewarmLocked(a *hostv1.Artifact) {
	id := a.GetId()
	// An evicted artifact is not topped up.
	if _, ok := h.artifacts[id]; !ok {
		return
	}
	for !h.draining && len(h.warm[id])+h.filling[id] < h.cfg.Prewarm {
		need := int64(a.GetMemoryMib())
		if h.cfg.MemoryMiB > 0 && h.committedLocked()+need > h.cfg.MemoryMiB {
			return
		}
		live := h.trackLocked(a)
		h.filling[id]++
		h.tasks.Go(func() { h.boot(live) })
	}
}

// boot starts a prewarm instance and parks it.
func (h *Host) boot(live *liveInstance) {
	id := live.artifact.GetId()
	instance, kind, err := h.driver.Acquire(h.background, fromProto(live.artifact))
	h.mu.Lock()
	h.filling[id]--
	if h.filling[id] == 0 {
		delete(h.filling, id)
	}
	h.mu.Unlock()
	if err != nil {
		h.untrack(live)
		if h.background.Err() == nil {
			h.log.Warn("prewarm", "artifact_id", id, "err", err)
		}
		return
	}
	live.ready(instance, kind, "")
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, served := h.artifacts[id]; h.draining || !served {
		live.releasing()
		h.tasks.Go(func() {
			h.kill(live)
			h.untrack(live)
		})
		return
	}
	live.idle(time.Now())
	h.warm[id] = append(h.warm[id], live)
}

func (h *Host) committedLocked() int64 {
	var total int64
	for _, live := range h.instances {
		total += int64(live.artifact.GetMemoryMib())
	}
	return total
}

func (h *Host) oldestWarmLocked() *liveInstance {
	var oldest *liveInstance
	for _, idle := range h.warm {
		if len(idle) > 0 && (oldest == nil || idle[0].lastUsed().Before(oldest.lastUsed())) {
			oldest = idle[0]
		}
	}
	return oldest
}

func (h *Host) unwarmLocked(live *liveInstance) {
	id := live.artifact.GetId()
	idle := h.warm[id]
	for i, candidate := range idle {
		if candidate == live {
			h.warm[id] = append(idle[:i], idle[i+1:]...)
			break
		}
	}
	if len(h.warm[id]) == 0 {
		delete(h.warm, id)
	}
}

func (h *Host) handleDescribe(context.Context, []byte) proto.Message {
	return &hostv1.DescribeResponse{Host: h.describe()}
}

func (h *Host) handleInstances(context.Context, []byte) proto.Message {
	h.mu.Lock()
	all := make([]*liveInstance, 0, len(h.instances))
	for _, live := range h.instances {
		all = append(all, live)
	}
	h.mu.Unlock()
	resp := &hostv1.ListInstancesResponse{}
	for _, live := range all {
		in := live.proto()
		in.Host = h.cfg.Name
		resp.Instances = append(resp.Instances, in)
	}
	sort.Slice(resp.Instances, func(i, j int) bool { return resp.Instances[i].GetStartedAt() < resp.Instances[j].GetStartedAt() })
	return resp
}

// describe is the host as the server sees it.
func (h *Host) describe() *functionsv1.Host {
	info := h.driver.Info(h.background)
	h.mu.Lock()
	committed := h.committedLocked()
	h.mu.Unlock()
	return &functionsv1.Host{
		Hostname:           h.cfg.Name,
		StartedAt:          h.startedAt.UnixMilli(),
		Slots:              int32(cap(h.slots)), //nolint:gosec // small
		SlotsInUse:         int32(len(h.slots)), //nolint:gosec // small
		MemoryMibCommitted: committed,
		FirecrackerVersion: info.FirecrackerVersion,
		Kernel:             info.Kernel,
		RootfsCacheBytes:   info.RootfsCacheBytes,
		RootfsCacheImages:  info.RootfsCacheImages,
	}
}

// liveInstance is a microVM this host knows about. key is its map entry and
// never changes; id is the placeholder until the driver names it.
type liveInstance struct {
	mu        sync.Mutex
	key       string
	id        string
	artifact  *hostv1.Artifact
	status    functionsv1.InstanceStatus
	startKind functionsv1.StartKind
	startedAt time.Time
	invID     string
	usedAt    time.Time
	instance  driver.Instance
}

// trackLocked registers an instance that is about to be acquired. Until the
// driver returns, it has a placeholder id and is BOOTING.
func (h *Host) trackLocked(a *hostv1.Artifact) *liveInstance {
	raw := make([]byte, 4)
	_, _ = rand.Read(raw)
	key := "booting-" + hex.EncodeToString(raw)
	live := &liveInstance{
		key:       key,
		id:        key,
		artifact:  a,
		status:    functionsv1.InstanceStatus_INSTANCE_STATUS_BOOTING,
		startedAt: time.Now(),
	}
	h.instances[live.key] = live
	return live
}

func (h *Host) untrack(live *liveInstance) {
	h.mu.Lock()
	delete(h.instances, live.key)
	h.mu.Unlock()
}

func (live *liveInstance) ready(in driver.Instance, kind functionsv1.StartKind, invocationID string) {
	live.mu.Lock()
	defer live.mu.Unlock()
	live.instance = in
	live.startKind = kind
	live.invID = invocationID
	live.status = functionsv1.InstanceStatus_INSTANCE_STATUS_BUSY
	live.id = in.ID()
}

// idle marks live warm: booted, between invocations.
func (live *liveInstance) idle(now time.Time) {
	live.mu.Lock()
	defer live.mu.Unlock()
	live.status = functionsv1.InstanceStatus_INSTANCE_STATUS_READY
	live.invID = ""
	live.usedAt = now
}

func (live *liveInstance) lastUsed() time.Time {
	live.mu.Lock()
	defer live.mu.Unlock()
	return live.usedAt
}

func (live *liveInstance) releasing() {
	live.mu.Lock()
	live.status = functionsv1.InstanceStatus_INSTANCE_STATUS_RELEASING
	live.mu.Unlock()
}

func (live *liveInstance) statusNow() functionsv1.InstanceStatus {
	live.mu.Lock()
	defer live.mu.Unlock()
	return live.status
}

func (live *liveInstance) proto() *functionsv1.Instance {
	live.mu.Lock()
	defer live.mu.Unlock()
	return &functionsv1.Instance{
		Id:           live.id,
		ArtifactId:   live.artifact.GetId(),
		Status:       live.status,
		StartKind:    live.startKind,
		StartedAt:    live.startedAt.UnixMilli(),
		InvocationId: live.invID,
		Vcpus:        live.artifact.GetVcpus(),
		MemoryMib:    live.artifact.GetMemoryMib(),
	}
}

func cmpNonZero(a, b int64) int64 {
	if a != 0 {
		return a
	}
	return b
}
