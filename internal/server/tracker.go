package server

import (
	"context"
	"crypto/rand"
	"fmt"
	"sync"
	"time"

	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
)

// recentFor is how long an ended invocation stays on the server that ran
// it, so a lookup that beats its record to the database still finds it.
const recentFor = 10 * time.Second

// invocationTracker is the invocations this server knows about and the
// database does not yet: those in flight, and those that ended moments ago.
// It is the server's only invocation state, and every server has its own.
type invocationTracker struct {
	mu     sync.Mutex
	active map[string]*functionsv1.Invocation
	recent map[string]*ended
}

type ended struct {
	inv *functionsv1.Invocation
	at  time.Time
}

func newTracker() *invocationTracker {
	return &invocationTracker{active: make(map[string]*functionsv1.Invocation), recent: make(map[string]*ended)}
}

// put starts tracking inv.
func (t *invocationTracker) put(inv *functionsv1.Invocation) {
	t.mu.Lock()
	t.active[inv.GetId()] = inv
	t.mu.Unlock()
}

// update applies fn to the invocation with id, under the lock, and returns
// a copy of the result. A terminal status moves it from active to recent.
// It returns nil for an id this server does not track.
func (t *invocationTracker) update(id string, fn func(*functionsv1.Invocation)) *functionsv1.Invocation {
	t.mu.Lock()
	defer t.mu.Unlock()
	inv, ok := t.active[id]
	if !ok {
		return nil
	}
	fn(inv)
	if terminal(inv.GetStatus()) {
		delete(t.active, id)
		t.recent[id] = &ended{inv: inv, at: time.Now()}
	}
	return proto.Clone(inv).(*functionsv1.Invocation) //nolint:errcheck // Clone preserves the type
}

// drop forgets an invocation that was tracked but never announced: a keyed
// call that found its key taken.
func (t *invocationTracker) drop(id string) {
	t.mu.Lock()
	delete(t.active, id)
	t.mu.Unlock()
}

// get returns a copy of the invocation with id, in flight or recent.
func (t *invocationTracker) get(id string) *functionsv1.Invocation {
	t.mu.Lock()
	defer t.mu.Unlock()
	if inv, ok := t.active[id]; ok {
		return proto.Clone(inv).(*functionsv1.Invocation) //nolint:errcheck // Clone preserves the type
	}
	if e, ok := t.recent[id]; ok {
		return proto.Clone(e.inv).(*functionsv1.Invocation) //nolint:errcheck // Clone preserves the type
	}
	return nil
}

// list returns copies of every tracked invocation.
func (t *invocationTracker) list() []*functionsv1.Invocation {
	t.mu.Lock()
	defer t.mu.Unlock()
	out := make([]*functionsv1.Invocation, 0, len(t.active)+len(t.recent))
	for _, inv := range t.active {
		out = append(out, proto.Clone(inv).(*functionsv1.Invocation)) //nolint:errcheck // Clone preserves the type
	}
	for _, e := range t.recent {
		out = append(out, proto.Clone(e.inv).(*functionsv1.Invocation)) //nolint:errcheck // Clone preserves the type
	}
	return out
}

// pending counts invocations accepted that no host has started.
func (t *invocationTracker) pending() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	n := 0
	for _, inv := range t.active {
		if inv.GetStatus() == functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING {
			n++
		}
	}
	return n
}

// forget drops recent invocations that ended before now minus recentFor.
func (t *invocationTracker) forget(now time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	for id, e := range t.recent {
		if now.Sub(e.at) > recentFor {
			delete(t.recent, id)
		}
	}
}

func terminal(s functionsv1.InvocationStatus) bool {
	switch s {
	case functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING,
		functionsv1.InvocationStatus_INVOCATION_STATUS_STARTING,
		functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING,
		functionsv1.InvocationStatus_INVOCATION_STATUS_UNSPECIFIED:
		return false
	default:
		return true
	}
}

// newID is a random UUID, version 4.
func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// handleActiveInvocations answers another server with what this one holds.
func (s *Service) handleActiveInvocations(context.Context, []byte) proto.Message {
	return &hostv1.ActiveInvocationsResponse{Invocations: s.tracker.list()}
}

// trackedAnywhere asks every server for the invocations it tracks. With
// functionID, only that function's.
func (s *Service) trackedAnywhere(ctx context.Context, functionID string) ([]*functionsv1.Invocation, error) {
	replies, err := s.bus.Gather(ctx, bus.ServerInvocationsSubject, &hostv1.ActiveInvocationsRequest{}, s.cfg.GatherWindow,
		func() proto.Message { return &hostv1.ActiveInvocationsResponse{} })
	if err != nil {
		return nil, err
	}
	var out []*functionsv1.Invocation
	for _, r := range replies {
		for _, inv := range r.(*hostv1.ActiveInvocationsResponse).GetInvocations() { //nolint:errcheck // newResp makes ActiveInvocationsResponses
			if functionID == "" || inv.GetFunctionId() == functionID {
				out = append(out, inv)
			}
		}
	}
	return out, nil
}

// trackedBy finds the invocation with id on whichever server tracks it. It
// returns nil when none does.
func (s *Service) trackedBy(ctx context.Context, id string) *functionsv1.Invocation {
	if inv := s.tracker.get(id); inv != nil {
		return inv
	}
	reply, err := s.bus.First(ctx, bus.ServerInvocationsSubject, &hostv1.ActiveInvocationsRequest{}, len(s.liveServers())+1,
		func() proto.Message { return &hostv1.ActiveInvocationsResponse{} },
		func(m proto.Message) bool {
			for _, inv := range m.(*hostv1.ActiveInvocationsResponse).GetInvocations() { //nolint:errcheck // newResp makes ActiveInvocationsResponses
				if inv.GetId() == id {
					return true
				}
			}
			return false
		})
	if err != nil {
		return nil
	}
	for _, inv := range reply.(*hostv1.ActiveInvocationsResponse).GetInvocations() { //nolint:errcheck // newResp makes ActiveInvocationsResponses
		if inv.GetId() == id {
			return inv
		}
	}
	return nil
}
