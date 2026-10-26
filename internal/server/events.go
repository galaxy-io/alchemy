package server

import (
	"context"
	"strings"

	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
)

// tailBuffer is how many events a live stream may fall behind before it
// loses some. Losing events never holds up the invocation path; a client
// can reconnect with replay to resync.
const tailBuffer = 256

// publishInvocation sends inv, as this server last saw it, to the live
// streams on every server, this one included. Nothing is written.
func (s *Service) publishInvocation(inv *functionsv1.Invocation) {
	if err := s.bus.Publish(bus.InvocationSubject(inv.GetFunctionId()), inv); err != nil {
		s.log.Warn("publish invocation", "invocation_id", inv.GetId(), "err", err)
	}
}

// tail calls fn with a function's invocations, or every function's when
// functionID is empty, as any server publishes them, until ctx ends or fn
// fails.
func (s *Service) tail(ctx context.Context, functionID string, fn func(*functionsv1.Invocation) error) error {
	subject := bus.InvocationWildcard
	if functionID != "" {
		subject = bus.InvocationSubject(functionID)
	}
	ch := make(chan *functionsv1.Invocation, tailBuffer)
	sub, err := s.bus.Subscribe(ctx, subject, "", func(_ context.Context, data []byte) proto.Message {
		inv := &functionsv1.Invocation{}
		if err := proto.Unmarshal(data, inv); err != nil {
			return nil
		}
		select {
		case ch <- inv:
		default:
		}
		return nil
	})
	if err != nil {
		return err
	}
	defer sub.Unsubscribe()
	for {
		select {
		case <-ctx.Done():
			return nil
		case inv := <-ch:
			if err := fn(inv); err != nil {
				return err
			}
		}
	}
}

// eventType is the status as a wire token: "running", "succeeded", ...
func eventType(s functionsv1.InvocationStatus) string {
	return strings.ToLower(strings.TrimPrefix(s.String(), "INVOCATION_STATUS_"))
}
