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

	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/driver"
)

const (
	// supervisorGrace is how long past the function's timeout the host waits
	// for the supervisor to report it before giving up on the instance.
	supervisorGrace = 5 * time.Second
	releaseTimeout  = 30 * time.Second
	logTailBytes    = 4 << 10
)

// Config tunes one host.
type Config struct {
	// Name is the host's identity on the bus; the hostname by default.
	Name string
	// MaxConcurrency is how many invocations may hold an instance at once.
	MaxConcurrency    int
	BuildTimeout      time.Duration
	HeartbeatInterval time.Duration
}

// DefaultConfig returns the defaults a host starts with.
func DefaultConfig() Config {
	return Config{
		MaxConcurrency:    8,
		BuildTimeout:      5 * time.Minute,
		HeartbeatInterval: 2 * time.Second,
	}
}

// Host serves one machine's capacity on the bus.
type Host struct {
	cfg       Config
	driver    driver.Driver
	bus       *bus.Bus
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
	instances map[string]*liveInstance     // by instance id
}

// New returns a host that is not yet serving; Run starts it.
func New(cfg Config, d driver.Driver, b *bus.Bus, log *slog.Logger) *Host {
	bg, stop := context.WithCancel(context.Background())
	return &Host{
		cfg:        cfg,
		driver:     d,
		bus:        b,
		log:        log,
		startedAt:  time.Now(),
		slots:      make(chan struct{}, cfg.MaxConcurrency),
		background: bg,
		stop:       stop,
		artifacts:  make(map[string]*bus.Subscription),
		instances:  make(map[string]*liveInstance),
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
		{bus.BuildSubject, bus.HostsQueue, h.handleBuild},
		{bus.DescribeSubject, "", h.handleDescribe},
		{bus.InstancesSubject, "", h.handleInstances},
	} {
		sub, err := h.bus.Serve(h.background, s.subject, s.queue, s.handler)
		if err != nil {
			return err
		}
		subs = append(subs, sub)
	}
	h.log.Info("host serving", "name", h.cfg.Name, "slots", h.cfg.MaxConcurrency)

	ticker := time.NewTicker(h.cfg.HeartbeatInterval)
	defer ticker.Stop()
	h.heartbeat()
	for {
		select {
		case <-ticker.C:
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
			h.stop()
			h.tasks.Wait()
			return nil
		}
	}
}

func (h *Host) heartbeat() {
	if err := h.bus.Publish(bus.HeartbeatSubject(h.cfg.Name), &hostv1.Heartbeat{Host: h.describe()}); err != nil {
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
	h.log.Info("build ready", "artifact", artifact.GetId(), "digest", artifact.GetDigest(), "took", time.Since(start).Round(time.Millisecond))
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
	start := time.Now()

	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		return invokeError("resource_exhausted", errors.New("host is at capacity"))
	}

	h.publishState(req.GetInvocationId(), functionsv1.InvocationStatus_INVOCATION_STATUS_STARTING, "", functionsv1.StartKind_START_KIND_UNSPECIFIED, 0)
	artifact := fromProto(req.GetArtifact())
	live := h.track(req.GetArtifact())
	instance, startKind, err := h.driver.Acquire(ctx, artifact)
	if err != nil {
		h.untrack(live)
		return invokeError("unavailable", fmt.Errorf("acquire instance: %w", err))
	}
	live.ready(instance, startKind, req.GetInvocationId())
	// Teardown must not delay the reply or die with the request.
	defer h.tasks.Go(func() {
		live.releasing()
		releaseCtx, cancel := context.WithTimeout(h.background, releaseTimeout)
		defer cancel()
		instance.Release(releaseCtx)
		h.untrack(live)
	})
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
	out, err := instance.Invoke(runCtx, &supervisorv1.InvokeRequest{
		InvocationId: req.GetInvocationId(),
		Input:        req.GetInput(),
		TimeoutMs:    timeout.Milliseconds(),
		HostTimeMs:   time.Now().UnixMilli(),
	})
	switch {
	case err == nil:
		if f := out.GetFailure(); f != nil {
			resp.Result = &hostv1.InvokeResponse_Failure{Failure: f}
		} else {
			resp.Result = &hostv1.InvokeResponse_Output{Output: out.GetOutput()}
		}
		resp.RunUs = cmpNonZero(out.GetRunUs(), time.Since(acquired).Microseconds())
		resp.LogTail = tail(out.GetLogTail())
	case errors.Is(runCtx.Err(), context.DeadlineExceeded):
		// The supervisor never answered; the function is the likeliest cause.
		resp.Result = &hostv1.InvokeResponse_Failure{Failure: &supervisorv1.Failure{
			Kind:    supervisorv1.FailureKind_FAILURE_KIND_TIMEOUT,
			Message: fmt.Sprintf("function exceeded its %dms timeout and the instance stopped responding", timeout.Milliseconds()),
		}}
		resp.RunUs = time.Since(acquired).Microseconds()
	default:
		return invokeError("unavailable", fmt.Errorf("invoke instance: %w", err))
	}
	return resp
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
		h.log.Warn("publish invocation state", "invocation", invocationID, "err", err)
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
	var committed int64
	for _, live := range h.instances {
		committed += int64(live.artifact.GetMemoryMib())
	}
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
	instance  driver.Instance
}

// track registers an instance that is about to be acquired. Until the
// driver returns, it has a placeholder id and is BOOTING.
func (h *Host) track(a *hostv1.Artifact) *liveInstance {
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
	h.mu.Lock()
	h.instances[live.key] = live
	h.mu.Unlock()
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

func tail(s string) string {
	if len(s) > logTailBytes {
		return s[len(s)-logTailBytes:]
	}
	return s
}
