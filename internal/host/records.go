package host

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
)

const (
	// recordFlushInterval is how long a record waits for company before it
	// is published.
	recordFlushInterval = 100 * time.Millisecond
	// recordBatchSize publishes a batch early, so a busy host sends a few
	// messages a second however many invocations it runs.
	recordBatchSize = 500
	// recordBacklog is how many records the host keeps while the stream is
	// unreachable. Past it, new records are dropped and counted.
	recordBacklog        = 100_000
	recordPublishTimeout = 10 * time.Second
)

// record is the invocation as it ended: the server's half from the request,
// completed with what host saw. acquired is zero when nothing ran.
func record(host string, accepted *functionsv1.Invocation, resp *hostv1.InvokeResponse, start, acquired time.Time) *functionsv1.Invocation {
	inv := proto.Clone(accepted).(*functionsv1.Invocation) //nolint:errcheck // Clone preserves the type
	now := time.Now()
	inv.InstanceId = resp.GetInstanceId()
	inv.StartKind = resp.GetStartKind()
	inv.Host = host
	if !acquired.IsZero() {
		inv.StartedAt = acquired.UnixMilli()
	}
	inv.EndedAt = now.UnixMilli()
	inv.Stats = &functionsv1.InvocationStats{
		StartKind: resp.GetStartKind(),
		AcquireUs: resp.GetAcquireUs(),
		RunUs:     resp.GetRunUs(),
		TotalUs:   now.Sub(start).Microseconds(),
	}
	switch fe := resp.GetFunctionError(); {
	case fe == nil:
		inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_SUCCEEDED
		inv.OutputBytes = int64(len(resp.GetOutput()))
	case fe.GetKind() == functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_INPUT_INVALID:
		inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_REJECTED
		inv.Error = fe
	default:
		inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_FAILED
		inv.Error = fe
	}
	return inv
}

// ended is the record of an invocation that ended on host without a result
// from the function, with status and why.
func ended(host string, accepted *functionsv1.Invocation, status functionsv1.InvocationStatus, why string) *functionsv1.Invocation {
	inv := proto.CloneOf(accepted)
	inv.Host = host
	inv.Status = status
	inv.PlatformError = why
	inv.EndedAt = time.Now().UnixMilli()
	return inv
}

// recordQueue publishes ended invocations to the invocation stream in batches.
type recordQueue struct {
	bus *bus.Bus
	log *slog.Logger

	mu      sync.Mutex
	pending []*functionsv1.Invocation
	dropped int
	full    chan struct{} // a batch is ready before the interval is up
}

func newRecordQueue(b *bus.Bus, log *slog.Logger) *recordQueue {
	return &recordQueue{bus: b, log: log, full: make(chan struct{}, 1)}
}

func (q *recordQueue) add(inv *functionsv1.Invocation) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.pending) >= recordBacklog {
		q.dropped++
		return
	}
	q.pending = append(q.pending, inv)
	if len(q.pending) >= recordBatchSize {
		select {
		case q.full <- struct{}{}:
		default:
		}
	}
}

// run publishes until ctx ends, then publishes what is left.
func (q *recordQueue) run(ctx context.Context) {
	ticker := time.NewTicker(recordFlushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			q.flush(context.WithoutCancel(ctx))
			return
		case <-ticker.C:
		case <-q.full:
		}
		q.flush(ctx)
	}
}

// flush publishes pending records a batch at a time. A batch that fails to
// publish stays pending for the next flush.
func (q *recordQueue) flush(ctx context.Context) {
	for {
		q.mu.Lock()
		n := min(len(q.pending), recordBatchSize)
		batch := make([]*functionsv1.Invocation, n)
		copy(batch, q.pending[:n])
		dropped := q.dropped
		q.mu.Unlock()
		if n == 0 {
			return
		}
		pubCtx, cancel := context.WithTimeout(ctx, recordPublishTimeout)
		err := q.bus.PublishInvocations(pubCtx, bus.InvocationsHostSubject, &hostv1.InvocationRecords{Invocations: batch})
		cancel()
		if err != nil {
			q.log.Warn("publish invocation records", "count", n, "pending", len(q.pending), "err", err)
			return
		}
		q.mu.Lock()
		q.pending = q.pending[n:]
		q.dropped -= dropped
		q.mu.Unlock()
		if dropped > 0 {
			q.log.Error("invocation records were dropped while the invocation stream was unreachable", "count", dropped)
		}
		if n < recordBatchSize {
			return
		}
	}
}
