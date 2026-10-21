// Package host is the per-machine process: it builds artifacts, runs
// instances and serves invocations over the bus. It holds nothing durable;
// if it dies, its instances die with it and the server records the
// invocations it was serving as errored.
package host

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	"gocloud.dev/blob"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
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
	Prewarm           int
	BuildTimeout      time.Duration
	HeartbeatInterval time.Duration
}

// DefaultConfig returns the defaults a host starts with.
func DefaultConfig() Config {
	return Config{
		MaxConcurrency:    8,
		WarmTTL:           5 * time.Minute,
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
	log       *slog.Logger
	startedAt time.Time
	slots     chan struct{}

	// background outlives any one request: instance teardown and the
	// subscriptions run on it.
	background context.Context
	stop       context.CancelFunc
	tasks      sync.WaitGroup

	mu        sync.Mutex
	artifacts map[string]*bus.Subscription // invoke subscriptions, by artifact id
	instances map[string]*liveInstance     // every instance, by key
	warm      map[string][]*liveInstance   // idle instances by artifact id, most recently used last
	draining  bool                         // shutting down: nothing more is parked
	filling   map[string]int               // prewarm boots in flight, by artifact id
}

// New returns a host that is not yet serving; Run starts it. Function logs
// are uploaded to logBucket, when there is one.
func New(cfg Config, d driver.Driver, b *bus.Bus, logBucket *blob.Bucket, log *slog.Logger) *Host {
	bg, stop := context.WithCancel(context.Background())
	return &Host{
		cfg:        cfg,
		driver:     d,
		bus:        b,
		logs:       logBucket,
		log:        log,
		startedAt:  time.Now(),
		slots:      make(chan struct{}, cfg.MaxConcurrency),
		background: bg,
		stop:       stop,
		artifacts:  make(map[string]*bus.Subscription),
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
	}{
		// Every host builds every artifact, so any of them can serve it.
		{bus.BuildSubject, "", h.handleBuild},
		// The server sends builds here for artifacts this host should serve but lacks.
		{bus.HostBuildSubject(h.cfg.Name), "", h.handleBuild},
		{bus.DescribeSubject, "", h.handleDescribe},
		{bus.InstancesSubject, "", h.handleInstances},
	} {
		sub, err := h.bus.Serve(h.background, s.subject, s.queue, s.handler)
		if err != nil {
			return err
		}
		subs = append(subs, sub)
	}
	h.log.Info("host serving", "slots", h.cfg.MaxConcurrency, "memory_mib", h.cfg.MemoryMiB, "warm_ttl", h.cfg.WarmTTL, "prewarm", h.cfg.Prewarm)

	ticker := time.NewTicker(h.cfg.HeartbeatInterval)
	defer ticker.Stop()
	h.heartbeat()
	for {
		select {
		case <-ticker.C:
			h.expireWarm(time.Now())
			h.heartbeat()
		case <-ctx.Done():
			for _, s := range subs {
				s.Unsubscribe()
			}
			h.mu.Lock()
			for _, s := range h.artifacts {
				s.Unsubscribe()
			}
			h.mu.Unlock()
			h.drainWarm()
			h.stop()
			h.tasks.Wait()
			return nil
		}
	}
}

func (h *Host) heartbeat() {
	h.mu.Lock()
	ids := make([]string, 0, len(h.artifacts))
	for id := range h.artifacts {
		ids = append(ids, id)
	}
	h.mu.Unlock()
	if err := h.bus.Publish(bus.HeartbeatSubject(h.cfg.Name), &hostv1.Heartbeat{Host: h.describe(), ArtifactIds: ids}); err != nil {
		h.log.Warn("heartbeat", "err", err)
	}
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
	built, err := h.driver.Build(ctx, req.GetSpec())
	if err != nil {
		h.log.Warn("build failed", "image", req.GetSpec().GetImage(), "err", err)
		return &hostv1.BuildResponse{Result: &hostv1.BuildResponse_Error{Error: &hostv1.Error{Code: "internal", Message: err.Error()}}, BuildLog: err.Error()}
	}
	artifact := toProto(req.GetTenantId(), built)
	if err := h.serve(artifact); err != nil {
		return buildError("internal", err)
	}
	h.prewarm(artifact)
	h.log.Info("build ready", "artifact_id", artifact.GetId(), "digest", artifact.GetDigest(), "took", time.Since(start).Round(time.Millisecond))
	return &hostv1.BuildResponse{Result: &hostv1.BuildResponse_Artifact{Artifact: artifact}}
}

func buildError(code string, err error) *hostv1.BuildResponse {
	return &hostv1.BuildResponse{Result: &hostv1.BuildResponse_Error{Error: &hostv1.Error{Code: code, Message: err.Error()}}}
}

// serve subscribes to the invoke subject for an artifact this host has
// ready. Placement is this subscription: the server never picks a host.
func (h *Host) serve(a *hostv1.Artifact) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.artifacts[a.GetId()]; ok {
		return nil
	}
	sub, err := h.bus.Serve(h.background, bus.InvokeSubject(a.GetId()), bus.HostsQueue, h.handleInvoke)
	if err != nil {
		return err
	}
	h.artifacts[a.GetId()] = sub
	return nil
}

// handleInvoke runs one input through an instance. Every reply is an
// InvokeResponse; an Error result means no instance ran the input.
func (h *Host) handleInvoke(ctx context.Context, data []byte) proto.Message {
	req := &hostv1.InvokeRequest{}
	if err := proto.Unmarshal(data, req); err != nil {
		return invokeError("invalid_argument", err)
	}
	log := h.log.With("invocation_id", req.GetInvocationId(), "artifact_id", req.GetArtifact().GetId())
	start := time.Now()

	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		return invokeError("resource_exhausted", errors.New("host is at capacity"))
	}

	h.publishState(req.GetInvocationId(), functionsv1.InvocationStatus_INVOCATION_STATUS_STARTING, "", functionsv1.StartKind_START_KIND_UNSPECIFIED, 0)
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
	live.ready(instance, startKind, req.GetInvocationId())
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
	h.publishState(req.GetInvocationId(), functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING, instance.ID(), startKind, acquireUs)

	resp := &hostv1.InvokeResponse{
		InstanceId: instance.ID(),
		StartKind:  startKind,
		AcquireUs:  acquireUs,
	}
	timeout := time.Duration(req.GetTimeoutMs()) * time.Millisecond
	runCtx, cancel := context.WithTimeout(ctx, timeout+supervisorGrace)
	defer cancel()
	fnLogs := h.functionLogs(req, log)
	out, err := instance.Invoke(runCtx, &supervisorv1.InvokeRequest{
		InvocationId: req.GetInvocationId(),
		Input:        req.GetInput(),
		TimeoutMs:    timeout.Milliseconds(),
		HostTimeMs:   time.Now().UnixMilli(),
	}, fnLogs)
	fnLogs.end()
	switch {
	case err == nil:
		reusable = true
		if f := out.GetFailure(); f != nil {
			resp.Result = &hostv1.InvokeResponse_Failure{Failure: f}
		} else {
			resp.Result = &hostv1.InvokeResponse_Output{Output: out.GetOutput()}
		}
		resp.RunUs = cmpNonZero(out.GetRunUs(), time.Since(acquired).Microseconds())
	case errors.Is(runCtx.Err(), context.DeadlineExceeded):
		// The supervisor never answered; the function is the likeliest cause.
		resp.Result = &hostv1.InvokeResponse_Failure{Failure: &supervisorv1.Failure{
			Kind:    supervisorv1.FailureKind_FAILURE_KIND_TIMEOUT,
			Message: fmt.Sprintf("function exceeded its %dms timeout and the instance stopped responding", timeout.Milliseconds()),
		}}
		resp.RunUs = time.Since(acquired).Microseconds()
	default:
		log.Warn("invoke instance", "instance_id", instance.ID(), "err", err)
		return invokeError("unavailable", fmt.Errorf("invoke instance: %w", err))
	}
	log.Debug("invocation finished", "instance_id", instance.ID(), "start_kind", startKind, "acquire_us", acquireUs, "run_us", resp.GetRunUs())
	return resp
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
	subject := bus.LogSubject(tenantID, req.GetInvocationId())
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

func (h *Host) publishState(invocationID string, status functionsv1.InvocationStatus, instanceID string, kind functionsv1.StartKind, acquireUs int64) {
	err := h.bus.Publish(bus.InvocationStateSubject(invocationID), &hostv1.InvocationEvent{
		InvocationId: invocationID,
		Status:       status,
		InstanceId:   instanceID,
		StartKind:    kind,
		AcquireUs:    acquireUs,
	})
	if err != nil {
		h.log.Warn("publish invocation state", "invocation_id", invocationID, "err", err)
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
// when warm reuse is off, and the caller releases the instance instead.
func (h *Host) park(live *liveInstance) bool {
	if h.cfg.WarmTTL <= 0 {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.draining {
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
	if h.draining {
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
		resp.Instances = append(resp.Instances, live.proto())
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
