package bus

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"google.golang.org/protobuf/proto"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
)

// The invoke queue. A server publishes every invocation to the invoke
// stream and waits for its result on its own subject. Every host pulls from
// one shared consumer, one fetch per free slot, so the first host with room
// takes the next invocation. A payload too large for a message rides in the
// invoke object store and the message names it. A function's
// max_concurrency is a set of leases in the invoke lease bucket.
const (
	// InvokeStream holds invocations until a host has run them.
	InvokeStream = "INVOKE"
	// invokeConsumer is the durable consumer every host pulls from.
	invokeConsumer = "hosts"
	// InvokeObjects holds the inputs and outputs too large to inline.
	InvokeObjects = "INVOKE_PAYLOADS"
	// InvokeLeases holds the leases of functions that have a
	// max_concurrency.
	InvokeLeases = "INVOKE_LEASES"
	// InlinePayloadBytes is the largest input or output a message carries
	// itself. Larger ones go through the object store.
	InlinePayloadBytes = 8 << 20
)

// InvokeSubject is where invocations of function id are published.
func InvokeSubject(functionID string) string { return "invoke." + functionID }

// ServerResultSubject is where hosts publish the results of server name's
// invocations.
func ServerResultSubject(name string) string { return "server." + name + ".result" }

// InvokeQueueConfig sizes the invoke queue.
type InvokeQueueConfig struct {
	// Replicas is how many NATS servers keep each invocation and payload.
	Replicas int
	// MaxAge is how long an invocation no host took is kept. It must outlast
	// the longest deadline a caller may set.
	MaxAge time.Duration
	// AckWait is how long a host may hold an invocation without reporting
	// progress before the stream hands it to another host.
	AckWait time.Duration
}

// EnsureInvokeQueue creates the invoke stream, its consumer, object store
// and lease bucket, or brings existing ones to cfg.
func (b *Bus) EnsureInvokeQueue(ctx context.Context, cfg InvokeQueueConfig) error {
	js, err := jetstream.New(b.nc)
	if err != nil {
		return err
	}
	replicas := max(cfg.Replicas, 1)
	if _, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      InvokeStream,
		Subjects:  []string{InvokeSubject(">")},
		Storage:   jetstream.FileStorage,
		Replicas:  replicas,
		MaxAge:    cfg.MaxAge,
		Retention: jetstream.WorkQueuePolicy,
	}); err != nil {
		return fmt.Errorf("bus: invoke stream: %w", err)
	}
	if _, err := js.CreateOrUpdateConsumer(ctx, InvokeStream, jetstream.ConsumerConfig{
		Durable:       invokeConsumer,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       cfg.AckWait,
		MaxAckPending: -1,
	}); err != nil {
		return fmt.Errorf("bus: invoke consumer: %w", err)
	}
	if _, err := js.CreateOrUpdateObjectStore(ctx, jetstream.ObjectStoreConfig{
		Bucket:   InvokeObjects,
		TTL:      cfg.MaxAge,
		Storage:  jetstream.FileStorage,
		Replicas: replicas,
	}); err != nil {
		return fmt.Errorf("bus: invoke object store: %w", err)
	}
	if _, err := js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket:   InvokeLeases,
		Storage:  jetstream.FileStorage,
		Replicas: replicas,
	}); err != nil {
		return fmt.Errorf("bus: invoke leases: %w", err)
	}
	return nil
}

// InvokeQueue is one process's handle on the invoke queue.
type InvokeQueue struct {
	b        *Bus
	js       jetstream.JetStream
	consumer jetstream.Consumer
	objects  jetstream.ObjectStore
	leases   jetstream.KeyValue
}

// InvokeQueue opens the invoke queue, which EnsureInvokeQueue created.
func (b *Bus) InvokeQueue(ctx context.Context) (*InvokeQueue, error) {
	js, err := jetstream.New(b.nc)
	if err != nil {
		return nil, err
	}
	consumer, err := js.Consumer(ctx, InvokeStream, invokeConsumer)
	if err != nil {
		return nil, fmt.Errorf("bus: invoke consumer: %w", err)
	}
	objects, err := js.ObjectStore(ctx, InvokeObjects)
	if err != nil {
		return nil, fmt.Errorf("bus: invoke object store: %w", err)
	}
	leases, err := js.KeyValue(ctx, InvokeLeases)
	if err != nil {
		return nil, fmt.Errorf("bus: invoke leases: %w", err)
	}
	return &InvokeQueue{b: b, js: js, consumer: consumer, objects: objects, leases: leases}, nil
}

// Publish queues req and waits for the stream to have it. An input larger
// than InlinePayloadBytes goes to the object store first. The message id is
// the invocation's, so a publish retried after the stream stored it is
// dropped as a duplicate.
func (q *InvokeQueue) Publish(ctx context.Context, req *hostv1.InvokeRequest) error {
	id := req.GetInvocation().GetId()
	if len(req.GetInput()) > InlinePayloadBytes {
		name := "input/" + id
		if _, err := q.objects.PutBytes(ctx, name, req.GetInput()); err != nil {
			return fmt.Errorf("bus: store input: %w", err)
		}
		req = proto.CloneOf(req)
		req.Input, req.InputObject = nil, name
	}
	data, err := proto.Marshal(req)
	if err != nil {
		return err
	}
	if _, err := q.js.Publish(ctx, InvokeSubject(req.GetInvocation().GetFunctionId()), data, jetstream.WithMsgID(id)); err != nil {
		return fmt.Errorf("bus: publish invocation: %w", err)
	}
	return nil
}

// Next waits up to wait for the next invocation, and returns nil when none
// came. The input is in Request, read from the object store when it did
// not fit the message.
func (q *InvokeQueue) Next(ctx context.Context, wait time.Duration) (*Pulled, error) {
	batch, err := q.consumer.Fetch(1, jetstream.FetchMaxWait(wait))
	if err != nil {
		return nil, fmt.Errorf("bus: fetch invocation: %w", err)
	}
	var msg jetstream.Msg
	for m := range batch.Messages() {
		msg = m
	}
	if err := batch.Error(); err != nil && !errors.Is(err, nats.ErrTimeout) && !errors.Is(err, context.DeadlineExceeded) {
		return nil, fmt.Errorf("bus: fetch invocation: %w", err)
	}
	if msg == nil {
		return nil, nil
	}
	p := &Pulled{q: q, msg: msg, Request: &hostv1.InvokeRequest{}}
	if err := proto.Unmarshal(msg.Data(), p.Request); err != nil {
		// A message no host can read never becomes readable.
		_ = msg.Term()
		return nil, fmt.Errorf("bus: decode invocation: %w", err)
	}
	if name := p.Request.GetInputObject(); name != "" {
		input, err := q.objects.GetBytes(ctx, name)
		if err != nil {
			_ = msg.NakWithDelay(time.Second)
			return nil, fmt.Errorf("bus: read input: %w", err)
		}
		p.Request.Input = input
	}
	return p, nil
}

// Pulled is one invocation a host took from the queue.
type Pulled struct {
	q       *InvokeQueue
	msg     jetstream.Msg
	Request *hostv1.InvokeRequest
}

// Done removes the invocation from the queue, and its input from the
// object store.
func (p *Pulled) Done(ctx context.Context) error {
	if err := p.msg.DoubleAck(ctx); err != nil {
		return fmt.Errorf("bus: ack invocation: %w", err)
	}
	if name := p.Request.GetInputObject(); name != "" {
		_ = p.q.objects.Delete(ctx, name)
	}
	return nil
}

// Retry hands the invocation back to the queue for another host after
// delay.
func (p *Pulled) Retry(delay time.Duration) error { return p.msg.NakWithDelay(delay) }

// Working tells the stream this host still holds the invocation, so it is
// not handed to another host after AckWait.
func (p *Pulled) Working() error { return p.msg.InProgress() }

// PublishResult answers the server waiting on the invocation. An output
// larger than InlinePayloadBytes goes to the object store first.
func (q *InvokeQueue) PublishResult(ctx context.Context, subject string, res *hostv1.InvokeResult) error {
	if out := res.GetResponse().GetOutput(); len(out) > InlinePayloadBytes {
		name := "output/" + res.GetInvocationId()
		if _, err := q.objects.PutBytes(ctx, name, out); err != nil {
			return fmt.Errorf("bus: store output: %w", err)
		}
		res = proto.CloneOf(res)
		res.Response.Result, res.OutputObject = nil, name
	}
	return q.b.Publish(subject, res)
}

// Output reads the output a result left in the object store, and deletes
// it.
func (q *InvokeQueue) Output(ctx context.Context, name string) ([]byte, error) {
	out, err := q.objects.GetBytes(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("bus: read output: %w", err)
	}
	_ = q.objects.Delete(ctx, name)
	return out, nil
}

// Depth is the invocations waiting for a host and the ones hosts hold.
func (q *InvokeQueue) Depth(ctx context.Context) (waiting, running int, err error) {
	info, err := q.consumer.Info(ctx)
	if err != nil {
		return 0, 0, fmt.Errorf("bus: invoke consumer info: %w", err)
	}
	return int(info.NumPending), info.NumAckPending, nil //nolint:gosec // bounded by the stream
}

// Lease is one of a function's max_concurrency seats, held while one of
// its invocations runs. Each seat's value is the time it lapses, so a host
// that dies without releasing its seat frees it once that time passes.
type Lease struct {
	q        *InvokeQueue
	key      string
	revision uint64
}

// Lease takes one of functionID's limit seats for ttl, or returns nil when
// every seat is held.
func (q *InvokeQueue) Lease(ctx context.Context, functionID string, limit int, ttl time.Duration) (*Lease, error) {
	value := leaseValue(time.Now().Add(ttl))
	for _, seat := range rand.Perm(limit) { //nolint:gosec // spreads hosts across seats, not a secret
		key := "lease." + functionID + "." + strconv.Itoa(seat)
		rev, err := q.leases.Create(ctx, key, value)
		if err == nil {
			return &Lease{q: q, key: key, revision: rev}, nil
		}
		if !errors.Is(err, jetstream.ErrKeyExists) {
			return nil, fmt.Errorf("bus: take lease: %w", err)
		}
		held, err := q.leases.Get(ctx, key)
		switch {
		case errors.Is(err, jetstream.ErrKeyNotFound):
			continue
		case err != nil:
			return nil, fmt.Errorf("bus: read lease: %w", err)
		}
		if len(held.Value()) != 8 || time.Now().Before(leaseExpiry(held.Value())) {
			continue
		}
		// Lapsed: its holder died. Taking it over is a compare and swap, so
		// two hosts never both take it.
		if rev, err := q.leases.Update(ctx, key, value, held.Revision()); err == nil {
			return &Lease{q: q, key: key, revision: rev}, nil
		}
	}
	return nil, nil
}

// Renew extends the lease by ttl.
func (l *Lease) Renew(ctx context.Context, ttl time.Duration) error {
	rev, err := l.q.leases.Update(ctx, l.key, leaseValue(time.Now().Add(ttl)), l.revision)
	if err != nil {
		return fmt.Errorf("bus: renew lease: %w", err)
	}
	l.revision = rev
	return nil
}

// Release gives the seat back.
func (l *Lease) Release(ctx context.Context) error {
	return l.q.leases.Delete(ctx, l.key, jetstream.LastRevision(l.revision))
}

func leaseValue(until time.Time) []byte {
	return binary.BigEndian.AppendUint64(nil, uint64(until.UnixMilli())) //nolint:gosec // after 1970
}

func leaseExpiry(v []byte) time.Time {
	return time.UnixMilli(int64(binary.BigEndian.Uint64(v))) //nolint:gosec // written by leaseValue
}
