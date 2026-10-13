// Package bus is the NATS transport between the server and the hosts. It
// owns the subject layout documented in host/v1/host.proto and the
// protobuf-over-NATS conventions: one message per payload, request/reply
// with a deadline, scatter/gather with a window.
package bus

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"google.golang.org/protobuf/proto"
)

// Subjects. Hosts subscribe; the server publishes and requests.
const (
	BuildSubject     = "host.build"
	DescribeSubject  = "host.describe"
	InstancesSubject = "host.instances"
	// HostsQueue is the queue group every host joins for build requests, so
	// exactly one host builds a given artifact.
	HostsQueue = "hosts"
)

// InvokeSubject is where hosts that have artifactID ready take invocations.
func InvokeSubject(artifactID string) string { return "host.invoke." + artifactID }

// HeartbeatSubject is where host name announces itself.
func HeartbeatSubject(name string) string { return "host." + name + ".heartbeat" }

// HeartbeatWildcard matches every host's heartbeat.
const HeartbeatWildcard = "host.*.heartbeat"

// InvocationStateSubject carries a host's progress on one invocation.
func InvocationStateSubject(invocationID string) string {
	return "invocation." + invocationID + ".state"
}

// InvocationStateWildcard matches every invocation's progress.
const InvocationStateWildcard = "invocation.*.state"

// ErrNoResponders is returned by Request when nothing is subscribed to the
// subject: for an invoke subject, no host has the artifact ready.
var ErrNoResponders = errors.New("bus: no responders")

// Bus is one NATS connection.
type Bus struct {
	nc *nats.Conn
}

// Connect dials url and waits for the connection.
func Connect(url, name string) (*Bus, error) {
	nc, err := nats.Connect(url,
		nats.Name(name),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("bus: connect %s: %w", url, err)
	}
	return &Bus{nc: nc}, nil
}

// Close drains the connection so in-flight replies are delivered.
func (b *Bus) Close() { _ = b.nc.Drain() }

// Publish sends msg on subject and forgets it.
func (b *Bus) Publish(subject string, msg proto.Message) error {
	data, err := proto.Marshal(msg)
	if err != nil {
		return err
	}
	return b.nc.Publish(subject, data)
}

// Request sends req on subject and decodes the single reply into resp,
// bounded by ctx.
func (b *Bus) Request(ctx context.Context, subject string, req, resp proto.Message) error {
	data, err := proto.Marshal(req)
	if err != nil {
		return err
	}
	m, err := b.nc.RequestWithContext(ctx, subject, data)
	switch {
	case errors.Is(err, nats.ErrNoResponders):
		return ErrNoResponders
	case err != nil:
		return fmt.Errorf("bus: request %s: %w", subject, err)
	}
	return proto.Unmarshal(m.Data, resp)
}

// Gather sends req on subject and collects every reply that arrives within
// window, decoding each with newResp. It is how the server asks all hosts
// at once.
func (b *Bus) Gather(ctx context.Context, subject string, req proto.Message, window time.Duration, newResp func() proto.Message) ([]proto.Message, error) {
	data, err := proto.Marshal(req)
	if err != nil {
		return nil, err
	}
	inbox := nats.NewInbox()
	sub, err := b.nc.SubscribeSync(inbox)
	if err != nil {
		return nil, fmt.Errorf("bus: gather %s: %w", subject, err)
	}
	defer func() { _ = sub.Unsubscribe() }()
	if err := b.nc.PublishRequest(subject, inbox, data); err != nil {
		return nil, fmt.Errorf("bus: gather %s: %w", subject, err)
	}

	deadline := time.Now().Add(window)
	var out []proto.Message
	for {
		remaining := time.Until(deadline)
		if remaining <= 0 || ctx.Err() != nil {
			return out, nil
		}
		m, err := sub.NextMsg(remaining)
		if err != nil {
			return out, nil // timeout ends the window
		}
		resp := newResp()
		if err := proto.Unmarshal(m.Data, resp); err != nil {
			continue
		}
		out = append(out, resp)
	}
}

// Handler answers one request. Returning a nil reply sends nothing, which
// a requester sees as a timeout; handlers should reply with an error
// message instead whenever they can.
type Handler func(ctx context.Context, data []byte) (reply proto.Message)

// Subscribe handles messages on subject one at a time, in the order they
// arrive; use it for events whose order matters. With a queue, only one
// member of the group sees each message. The subscription lives until
// Unsubscribe.
func (b *Bus) Subscribe(ctx context.Context, subject, queue string, h Handler) (*Subscription, error) {
	return b.subscribe(ctx, subject, queue, h, false)
}

// Serve handles requests on subject concurrently, each on its own
// goroutine, so a slow request never holds up the next one. The handler
// bounds its own load. Use it for request/reply work.
func (b *Bus) Serve(ctx context.Context, subject, queue string, h Handler) (*Subscription, error) {
	return b.subscribe(ctx, subject, queue, h, true)
}

func (b *Bus) subscribe(ctx context.Context, subject, queue string, h Handler, concurrent bool) (*Subscription, error) {
	cb := func(m *nats.Msg) {
		if concurrent {
			go respond(ctx, m, h)
			return
		}
		respond(ctx, m, h)
	}
	var sub *nats.Subscription
	var err error
	if queue == "" {
		sub, err = b.nc.Subscribe(subject, cb)
	} else {
		sub, err = b.nc.QueueSubscribe(subject, queue, cb)
	}
	if err != nil {
		return nil, fmt.Errorf("bus: subscribe %s: %w", subject, err)
	}
	return &Subscription{sub: sub}, nil
}

func respond(ctx context.Context, m *nats.Msg, h Handler) {
	reply := h(ctx, m.Data)
	if reply == nil || m.Reply == "" {
		return
	}
	data, err := proto.Marshal(reply)
	if err != nil {
		return
	}
	_ = m.Respond(data)
}

// Subscription is one live subscription.
type Subscription struct{ sub *nats.Subscription }

// Unsubscribe stops delivery.
func (s *Subscription) Unsubscribe() { _ = s.sub.Unsubscribe() }
