package server

import (
	"strings"
	"sync"
	"time"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

// bus fans invocation transitions out to TailInvocations streams. A
// subscriber that falls behind loses events rather than blocking the
// invocation path; it can reconnect with replay to resync.
type eventBus struct {
	mu   sync.Mutex
	subs map[*subscriber]struct{}
}

type subscriber struct {
	functionID string
	ch         chan *functionsv1.TailInvocationsResponse
}

func newEventBus() *eventBus { return &eventBus{subs: make(map[*subscriber]struct{})} }

func (b *eventBus) subscribe(functionID string) *subscriber {
	s := &subscriber{functionID: functionID, ch: make(chan *functionsv1.TailInvocationsResponse, 256)}
	b.mu.Lock()
	b.subs[s] = struct{}{}
	b.mu.Unlock()
	return s
}

func (b *eventBus) unsubscribe(s *subscriber) {
	b.mu.Lock()
	delete(b.subs, s)
	b.mu.Unlock()
}

// publish emits inv's current status to every matching subscriber.
func (b *eventBus) publish(inv *functionsv1.Invocation) {
	ev := &functionsv1.TailInvocationsResponse{
		Invocation: inv,
		EventType:  eventType(inv.GetStatus()),
		EmittedAt:  time.Now().UnixMilli(),
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	for s := range b.subs {
		if s.functionID != "" && s.functionID != inv.GetFunctionId() {
			continue
		}
		select {
		case s.ch <- ev:
		default:
		}
	}
}

// eventType is the status as a wire token: "running", "succeeded", ...
func eventType(s functionsv1.InvocationStatus) string {
	return strings.ToLower(strings.TrimPrefix(s.String(), "INVOCATION_STATUS_"))
}
