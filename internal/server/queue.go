package server

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"time"

	"google.golang.org/protobuf/proto"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
)

const (
	// invokeAckWait is how long a host may hold a queued invocation without
	// reporting progress before the queue hands it to another host. Hosts
	// report well within it while they build and run.
	invokeAckWait = 30 * time.Second
	// queuedHost is the host an invocation is marked sent to once it is
	// queued, until the host that takes it reports itself.
	queuedHost = "queue"
)

// dispatch queues req and waits for its result until the call's deadline.
// Once queued, the function may run, so the record says so until a result
// arrives. An invocation still queued at its deadline is left for the
// first host that takes it to drop.
func (s *Service) dispatch(ctx context.Context, inv *invocation, cv *compiledVersion, req *hostv1.InvokeRequest) (*hostv1.InvokeResponse, error) {
	deadline := s.deadline(ctx)
	ctx, cancel := context.WithDeadline(ctx, deadline)
	defer cancel()

	id := req.GetInvocation().GetId()
	result := make(chan *hostv1.InvokeResult, 1)
	s.mu.Lock()
	s.waiting[id] = result
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.waiting, id)
		s.mu.Unlock()
	}()

	req.DeadlineMs = deadline.UnixMilli()
	req.ReplySubject = bus.ServerResultSubject(s.cfg.Name)
	req.Build = &hostv1.BuildRequest{TenantId: cv.row.TenantID, FunctionId: cv.row.FunctionID, Version: cv.row.Version, Spec: cv.pinnedSpec(), Layers: cv.artifact.GetLayers()}
	req.MaxConcurrency = cv.maxConcurrency
	if err := inv.sentTo(ctx, queuedHost); err != nil {
		return nil, err
	}
	if err := s.queue.Publish(ctx, req); err != nil {
		inv.notSent()
		return nil, err
	}

	select {
	case res := <-result:
		out := res.GetResponse()
		if name := res.GetOutputObject(); name != "" {
			output, err := s.queue.Output(ctx, name)
			if err != nil {
				return nil, err
			}
			out.Result = &hostv1.InvokeResponse_Output{Output: output}
		}
		return out, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("no result for invocation %s by its deadline: %w", id, ctx.Err())
	}
}

// deadline is when the call stops waiting: the caller's own deadline when
// it set one, capped at InvokeMaxDeadline, else InvokeDeadline from now.
func (s *Service) deadline(ctx context.Context) time.Time {
	latest := time.Now().Add(s.cfg.InvokeMaxDeadline)
	if d, ok := ctx.Deadline(); ok {
		if d.After(latest) {
			return latest
		}
		return d
	}
	return time.Now().Add(s.cfg.InvokeDeadline)
}

// onResult hands a host's result to the call waiting on it. A result no
// call waits on any more, because its caller gave up, is dropped; the
// host's record still reaches the database.
func (s *Service) onResult(_ context.Context, data []byte) proto.Message {
	res := &hostv1.InvokeResult{}
	if err := proto.Unmarshal(data, res); err != nil {
		s.log.Warn("decode invocation result", "err", err)
		return nil
	}
	s.mu.Lock()
	result, ok := s.waiting[res.GetInvocationId()]
	s.mu.Unlock()
	if !ok {
		return nil
	}
	select {
	case result <- res:
	default:
	}
	return nil
}

// hostsByLoad is the live hosts, fewest busy slots first: where a build or
// a compile goes, trying the next when one is gone or full.
func (s *Service) hostsByLoad() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	type load struct {
		name string
		busy int32
	}
	var live []load
	for name, k := range s.hosts {
		if time.Since(k.seen) <= s.cfg.HostTTL {
			live = append(live, load{name, k.host.GetSlotsInUse()})
		}
	}
	slices.SortFunc(live, func(a, b load) int {
		return cmp.Or(cmp.Compare(a.busy, b.busy), cmp.Compare(a.name, b.name))
	})
	out := make([]string, len(live))
	for i, l := range live {
		out[i] = l.name
	}
	return out
}

// hostLive reports whether host name heartbeated within HostTTL.
func (s *Service) hostLive(name string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	k, ok := s.hosts[name]
	return ok && time.Since(k.seen) <= s.cfg.HostTTL
}
