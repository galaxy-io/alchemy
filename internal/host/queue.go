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
// max_concurrency, and runs, with its result published to the server
// waiting on it.
func (h *Host) take(ctx context.Context, q *bus.InvokeQueue, p *bus.Pulled) {
	req := p.Request
	log := h.log.With("invocation_id", req.GetInvocation().GetId(), "artifact_id", req.GetArtifact().GetId())
	if d := req.GetDeadlineMs(); d > 0 && time.Now().UnixMilli() > d {
		// Its caller has stopped waiting, and recorded how it ended.
		log.Info("dropping invocation past its deadline")
		_ = p.Done(ctx)
		return
	}

	cfg := h.functionConfig(ctx, q, req.GetInvocation(), log)
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
	if err := h.ensureBuilt(ctx, req); err != nil {
		log.Warn("build for invocation", "err", err)
		resp = invokeError("failed_precondition", err)
	} else {
		// The lease is taken only once the invocation can run, so a build
		// holds none of the function's seats.
		if limit := int(cfg.GetMaxConcurrency()); limit > 0 {
			l, err := q.Lease(ctx, req.GetInvocation().GetFunctionId(), limit, leaseTTL)
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
		done := h.runningOne(req.GetInvocation())
		var retry bool
		resp, retry = h.invoke(h.background, req)
		done()
		if retry {
			log.Info("handing invocation back to the queue", "reason", resp.GetError().GetMessage())
			_ = p.Retry(retryDelay)
			return
		}
	}
	res := &hostv1.InvokeResult{InvocationId: req.GetInvocation().GetId(), Response: resp}
	if err := q.PublishResult(ctx, req.GetReplySubject(), res); err != nil {
		log.Warn("publish invocation result", "err", err)
	}
	if err := p.Done(context.WithoutCancel(ctx)); err != nil {
		log.Warn("ack invocation", "err", err)
	}
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
