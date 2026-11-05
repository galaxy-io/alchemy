package host

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"sync/atomic"
	"time"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
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
		if limit := int(req.GetMaxConcurrency()); limit > 0 {
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
		var retry bool
		resp, retry = h.invoke(h.background, req)
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
