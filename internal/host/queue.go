package host

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"sync/atomic"
	"time"

	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/internal/artifact"
	"github.com/galaxy-io/alchemy/internal/bus"
)

const (
	// pullWait is how long one fetch waits for an invocation before it asks
	// again.
	pullWait = 5 * time.Second
	// pullBackoff is how long a puller waits after the queue failed it.
	pullBackoff = time.Second
	// keepAlive is how often a host tells the queue it still holds an
	// invocation and renews its lease, well within the queue's ack wait.
	keepAlive = 10 * time.Second
	// leaseTTL is how long a lease outlives its last renewal.
	leaseTTL = 30 * time.Second
	// leaseFullDelay is how long an invocation of a function at its
	// max_concurrency goes back to the queue for, plus up to as much again.
	leaseFullDelay = 250 * time.Millisecond
	// retryDelay is how long an invocation this host could not take goes
	// back to the queue for, so another host takes it.
	retryDelay = 100 * time.Millisecond
	// functionConfigFor is how long a host uses a function's config before
	// it reads it again, so a change reaches queued invocations this fast.
	functionConfigFor = time.Second
)

// openQueue opens the invoke queue, waiting for a server to create it,
// until ctx ends.
func (h *Host) openQueue(ctx context.Context) (*bus.InvokeQueue, error) {
	for {
		q, err := h.bus.InvokeQueue(ctx)
		if err == nil {
			return q, nil
		}
		h.log.Info("waiting for a server to create the invoke queue", "err", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(pullBackoff):
		}
	}
}

// pull takes invocations from the queue until ctx ends, which is when the
// host starts shutting down. Each of the host's slots runs one puller, so
// the host never holds more invocations than it can run. What a puller
// took runs on the host's background context, so shutdown lets it finish.
func (h *Host) pull(ctx context.Context, q *bus.InvokeQueue) {
	for ctx.Err() == nil {
		p, err := q.Next(ctx, pullWait)
		switch {
		case ctx.Err() != nil:
			if p != nil {
				_ = p.Retry(0)
			}
			return
		case err != nil:
			h.log.Warn("pull invocation", "err", err)
			select {
			case <-ctx.Done():
			case <-time.After(pullBackoff):
			}
			continue
		case p == nil:
			continue
		}
		if !h.enter() {
			_ = p.Retry(0)
			return
		}
		h.take(h.background, q, p)
		h.handlers.Done()
	}
}

// take runs one pulled invocation to the end: it is dropped past its
// deadline, and otherwise takes a slot, has its artifact built when this
// host lacks it, waits in the queue again while its function is at
// max_concurrency, and runs. Each attempt ends in settle.
func (h *Host) take(ctx context.Context, q *bus.InvokeQueue, p *bus.Pulled) {
	req := p.Request
	inv := req.GetInvocation()
	log := h.log.With("invocation_id", inv.GetId(), "artifact_id", req.GetArtifact().GetId())
	failures := 0
	if p.Redelivered() {
		n, err := q.Failures(ctx, inv.GetId())
		if err != nil {
			log.Warn("read failed attempts", "err", err)
		}
		failures = n
	}
	if d := req.GetDeadlineMs(); d > 0 && time.Now().UnixMilli() > d {
		log.Info("dropping invocation past its deadline")
		if !req.GetAsync() {
			// Its caller has stopped waiting, and recorded how it ended.
			_ = p.Done(ctx)
			return
		}
		inv.Attempts = int32(failures) //nolint:gosec // bounded by retries
		h.end(ctx, q, p, ended("", inv, functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED, "expired in the queue before it could run"), nil, failures > 0, log)
		return
	}
	inv.Attempts = int32(failures + 1) //nolint:gosec // bounded by retries

	cfg := h.functionConfig(ctx, q, inv, log)
	resize(req, cfg)
	log = log.With("artifact_id", req.GetArtifact().GetId())

	var lease atomic.Pointer[bus.Lease]
	stop := h.keepAlive(ctx, p, &lease, log)
	defer stop()

	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	case <-ctx.Done():
		_ = p.Retry(0)
		return
	}

	var resp *hostv1.InvokeResponse
	var rec *functionsv1.Invocation
	if err := h.ensureBuilt(ctx, req); err != nil {
		log.Warn("build for invocation", "err", err)
		resp = invokeError("failed_precondition", err)
	} else {
		// The lease is taken only once the invocation can run, so a build
		// holds none of the function's seats.
		if limit := int(cfg.GetMaxConcurrency()); limit > 0 {
			l, err := q.Lease(ctx, inv.GetFunctionId(), limit, leaseTTL)
			if err != nil {
				log.Warn("take lease", "err", err)
			}
			if l == nil {
				_ = p.Retry(leaseFullDelay + rand.N(leaseFullDelay)) //nolint:gosec // jitter, not a secret
				return
			}
			lease.Store(l)
			defer func() { _ = l.Release(context.WithoutCancel(ctx)) }()
		}
		done := h.runningOne(inv)
		var retry bool
		resp, rec, retry = h.invoke(h.background, req)
		done()
		// A host with no room hands the invocation on without an attempt.
		// Any other reason not to run it is a failed attempt, which waits
		// out its backoff rather than circle the hosts.
		if retry && resp.GetError().GetCode() == "resource_exhausted" {
			log.Info("handing invocation back to the queue", "reason", resp.GetError().GetMessage())
			_ = p.Retry(retryDelay)
			return
		}
	}
	h.settle(ctx, q, p, cfg, resp, rec, log)
}

// settle ends one attempt. A function that raised, crashed or timed out,
// or a platform that could not run it, has it run again after a backoff
// while its retries allow and its deadline leaves room for another run. It
// waits in the queue, pending with the failed attempt's error. Otherwise
// the attempt's outcome is the invocation's.
func (h *Host) settle(ctx context.Context, q *bus.InvokeQueue, p *bus.Pulled, cfg *hostv1.FunctionConfig, resp *hostv1.InvokeResponse, rec *functionsv1.Invocation, log *slog.Logger) {
	req := p.Request
	inv := req.GetInvocation()
	if rec == nil {
		// Nothing ran, unless the instance went away holding the input.
		ran := ""
		if resp.GetError().GetCode() == "aborted" {
			ran = h.cfg.Name
		}
		rec = ended(ran, inv, functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, resp.GetError().GetMessage())
	}
	if !retryable(resp) {
		h.end(ctx, q, p, rec, resp, inv.GetAttempts() > 1, log)
		return
	}
	failed, err := q.Failed(ctx, inv.GetId())
	if err != nil {
		log.Warn("count failed attempt", "err", err)
		failed = int(inv.GetAttempts())
	}
	retries := cfg.GetRetries()
	if req.Retries != nil {
		retries = req.GetRetries()
	}
	delay := retryBackoff(req, failed)
	next := time.Now().Add(delay + time.Duration(req.GetTimeoutMs())*time.Millisecond)
	if failed > int(retries) || (req.GetDeadlineMs() > 0 && next.UnixMilli() >= req.GetDeadlineMs()) {
		h.end(ctx, q, p, rec, resp, true, log)
		return
	}
	log.Info("retrying invocation", "attempt", inv.GetAttempts(), "after", delay)
	waiting := proto.CloneOf(rec)
	waiting.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING
	waiting.EndedAt = 0
	h.follow(req, waiting)
	if err := p.Retry(delay); err != nil {
		log.Warn("hand invocation back for its next attempt", "err", err)
	}
}

// end records how the invocation ended, answers the server waiting on it,
// if any, and removes it from the queue, with its count of failed attempts
// when it has one.
func (h *Host) end(ctx context.Context, q *bus.InvokeQueue, p *bus.Pulled, rec *functionsv1.Invocation, resp *hostv1.InvokeResponse, counted bool, log *slog.Logger) {
	req := p.Request
	h.records.add(rec)
	if req.GetAsync() {
		h.publishInvocation(rec, log)
	}
	if subject := req.GetReplySubject(); subject != "" {
		res := &hostv1.InvokeResult{InvocationId: rec.GetId(), Response: resp, Attempts: rec.GetAttempts()}
		if err := q.PublishResult(ctx, subject, res); err != nil {
			log.Warn("publish invocation result", "err", err)
		}
	}
	ctx = context.WithoutCancel(ctx)
	if err := p.Done(ctx); err != nil {
		log.Warn("ack invocation", "err", err)
	}
	if !counted {
		return
	}
	if err := q.ForgetFailures(ctx, rec.GetId()); err != nil {
		log.Warn("forget failed attempts", "err", err)
	}
}

// retryable reports whether an attempt that ended with resp runs again:
// the platform could not run it, or the function raised, crashed or timed
// out. An input or output that breaks the contract would break it again.
func retryable(resp *hostv1.InvokeResponse) bool {
	if resp.GetError() != nil {
		return true
	}
	switch resp.GetFunctionError().GetKind() {
	case functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_RAISED,
		functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_CRASHED,
		functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_TIMEOUT:
		return true
	default:
		return false
	}
}

// retryBackoffFactor is how much longer each retry waits than the last.
const retryBackoffFactor = 5

// retryBackoff is how long an invocation waits after its failed-th
// failed attempt: the request's backoff, retryBackoffFactor times longer
// for each failure before, at most its maximum, give or take a fifth.
func retryBackoff(req *hostv1.InvokeRequest, failed int) time.Duration {
	ceiling := time.Duration(req.GetRetryBackoffMaxMs()) * time.Millisecond
	d := time.Duration(req.GetRetryBackoffMs()) * time.Millisecond
	for i := 1; i < failed && (ceiling <= 0 || d < ceiling); i++ {
		d *= retryBackoffFactor
	}
	if ceiling > 0 {
		d = min(d, ceiling)
	}
	jitter := time.Duration(rand.Int64N(int64(d)/5*2+1)) - d/5 //nolint:gosec // jitter, not a secret
	if d += jitter; ceiling > 0 {
		d = min(d, ceiling)
	}
	return max(d, 0)
}

// pendingBuild is one build of an artifact for invocations, which every
// invocation of that artifact arriving meanwhile waits on.
type pendingBuild struct {
	done chan struct{}
	resp *hostv1.BuildResponse
}

// ensureBuilt builds the invocation's artifact when this host does not
// serve it yet. Invocations of an artifact being built wait for that build
// rather than start their own.
func (h *Host) ensureBuilt(ctx context.Context, req *hostv1.InvokeRequest) error {
	id := req.GetArtifact().GetId()
	if h.serving(id) {
		return nil
	}
	h.mu.Lock()
	b, waiting := h.building[id]
	if !waiting {
		b = &pendingBuild{done: make(chan struct{})}
		h.building[id] = b
	}
	h.mu.Unlock()
	if waiting {
		select {
		case <-b.done:
		case <-ctx.Done():
			return ctx.Err()
		}
	} else {
		b.resp = h.build(ctx, req.GetBuild())
		h.mu.Lock()
		delete(h.building, id)
		h.mu.Unlock()
		close(b.done)
	}
	resp := b.resp
	if e := resp.GetError(); e != nil {
		return fmt.Errorf("version %d can no longer be built: %s; create a new version", req.GetInvocation().GetVersion(), e.GetMessage())
	}
	if built := resp.GetArtifact().GetId(); built != id {
		return fmt.Errorf("version %d rebuilt as a different artifact (%s); create a new version", req.GetInvocation().GetVersion(), built)
	}
	return nil
}

// keepAlive tells the queue this host still holds p, and renews its lease
// once it has one, until stop is called.
func (h *Host) keepAlive(ctx context.Context, p *bus.Pulled, lease *atomic.Pointer[bus.Lease], log *slog.Logger) (stop func()) {
	done := make(chan struct{})
	h.tasks.Go(func() {
		ticker := time.NewTicker(keepAlive)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := p.Working(); err != nil {
					log.Warn("report invocation progress", "err", err)
				}
				if l := lease.Load(); l != nil {
					if err := l.Renew(ctx, leaseTTL); err != nil && !errors.Is(err, context.Canceled) {
						log.Warn("renew lease", "err", err)
					}
				}
			}
		}
	})
	return func() { close(done) }
}

// functionKey names one tenant's function.
type functionKey struct{ tenant, function string }

// runningOne counts inv as running until the returned func is called.
func (h *Host) runningOne(inv *functionsv1.Invocation) (done func()) {
	key := functionKey{inv.GetTenantId(), inv.GetFunctionId()}
	h.mu.Lock()
	h.running[key]++
	h.mu.Unlock()
	return func() {
		h.mu.Lock()
		h.running[key]--
		if h.running[key] <= 0 {
			delete(h.running, key)
		}
		h.mu.Unlock()
	}
}

// runningByFunction is what the host is running, as its heartbeat says it.
func (h *Host) runningByFunction() []*hostv1.FunctionRunning {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]*hostv1.FunctionRunning, 0, len(h.running))
	for key, n := range h.running {
		out = append(out, &hostv1.FunctionRunning{TenantId: key.tenant, FunctionId: key.function, Count: n})
	}
	return out
}

// cachedFunctionConfig is a function's config and when it was read.
type cachedFunctionConfig struct {
	cfg *hostv1.FunctionConfig
	at  time.Time
}

// functionConfig is inv's function's config, read from the queue at most
// once every functionConfigFor. When it cannot be read, the last value
// stands; nil means none was ever recorded.
func (h *Host) functionConfig(ctx context.Context, q *bus.InvokeQueue, inv *functionsv1.Invocation, log *slog.Logger) *hostv1.FunctionConfig {
	key := functionKey{inv.GetTenantId(), inv.GetFunctionId()}
	h.mu.Lock()
	cached, ok := h.functionConfigs[key]
	h.mu.Unlock()
	if ok && time.Since(cached.at) < functionConfigFor {
		return cached.cfg
	}
	cfg, err := q.FunctionConfig(ctx, key.tenant, key.function)
	if err != nil {
		log.Warn("read function config", "err", err)
		return cached.cfg
	}
	h.mu.Lock()
	h.functionConfigs[key] = cachedFunctionConfig{cfg: cfg, at: time.Now()}
	h.mu.Unlock()
	return cfg
}

// resize has req run at its function's current resources. The server named
// the artifact when it queued req; a change since makes it the artifact
// those resources build, named as hosts name what they build.
func resize(req *hostv1.InvokeRequest, cfg *hostv1.FunctionConfig) {
	r := cfg.GetResources()
	a := req.GetArtifact()
	if r == nil || (r.GetVcpus() == a.GetVcpus() && r.GetMemoryMib() == a.GetMemoryMib()) {
		return
	}
	a = proto.CloneOf(a)
	a.Vcpus, a.MemoryMib = r.GetVcpus(), r.GetMemoryMib()
	a.Id = artifact.ID(a)
	req.Artifact = a
	if req.GetBuild() != nil {
		req.Build.Resources = r
	}
}
