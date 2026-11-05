package bus

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/nats-io/nats.go/jetstream"
	"google.golang.org/protobuf/proto"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
)

// Invocation records. Nothing is written about an invocation while it runs.
// When it ends, the host that ran it, or the server when no host did,
// publishes its record to a JetStream stream, and the servers share one
// consumer that writes records to the database in batches. The stream is
// the buffer between how fast invocations end and how fast the database
// takes them, and it holds records through a database outage.
const (
	// InvocationStream keeps the records of ended invocations until a server
	// has written them.
	InvocationStream = "INVOCATIONS"
	// InvocationsHostSubject carries records from hosts.
	InvocationsHostSubject = "invocations.host"
	// InvocationsServerSubject carries records from servers, which override a
	// host's record of the same invocation.
	InvocationsServerSubject = "invocations.server"
	// recordConsumer is the durable consumer every server pulls from.
	recordConsumer = "recorder"
	// recordAckWait is how long a server has to write a batch before the
	// stream hands it to another.
	recordAckWait = 30 * time.Second
)

// InvocationStreamConfig sizes the invocation stream.
type InvocationStreamConfig struct {
	// MaxAge is how long an unwritten record is kept.
	MaxAge time.Duration
	// Replicas is how many NATS servers keep each record.
	Replicas int
}

// EnsureInvocationStream creates the invocation stream, or brings an existing one
// to cfg. It lives on disk: a record has no other copy until it is written.
func (b *Bus) EnsureInvocationStream(ctx context.Context, cfg InvocationStreamConfig) error {
	js, err := jetstream.New(b.nc)
	if err != nil {
		return err
	}
	_, err = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      InvocationStream,
		Subjects:  []string{"invocations.>"},
		Storage:   jetstream.FileStorage,
		Replicas:  max(cfg.Replicas, 1),
		MaxAge:    cfg.MaxAge,
		Retention: jetstream.LimitsPolicy,
		Discard:   jetstream.DiscardOld,
	})
	if err != nil {
		return fmt.Errorf("bus: invocation stream: %w", err)
	}
	return nil
}

// PublishInvocations appends records to the invocation stream on subject
// and waits for the stream to have them. The message id is recordsMsgID, so
// a publish retried after the stream stored it but the acknowledgement was
// lost is dropped as a duplicate.
func (b *Bus) PublishInvocations(ctx context.Context, subject string, records *hostv1.InvocationRecords) error {
	data, err := proto.Marshal(records)
	if err != nil {
		return err
	}
	js, err := jetstream.New(b.nc)
	if err != nil {
		return err
	}
	if _, err := js.Publish(ctx, subject, data, jetstream.WithMsgID(recordsMsgID(subject, records))); err != nil {
		return fmt.Errorf("bus: publish invocations: %w", err)
	}
	return nil
}

// recordsMsgID names a batch of records by who published it and what each
// record says of its invocation: id, status and attempt. The same batch
// published again has the same name. Another record of the same
// invocation, such as the server's pending record and the host's later
// one, does not, so the stream keeps both.
func recordsMsgID(subject string, records *hostv1.InvocationRecords) string {
	h := sha256.New()
	h.Write([]byte(subject))
	h.Write([]byte{0})
	for _, inv := range records.GetInvocations() {
		h.Write([]byte(inv.GetId()))
		h.Write([]byte{0})
		h.Write([]byte(strconv.Itoa(int(inv.GetStatus()))))
		h.Write([]byte{0})
		h.Write([]byte(strconv.Itoa(int(inv.GetAttempts()))))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

// Message is one message from the invocation stream: a batch of records.
type Message struct {
	Subject string
	Data    []byte
}

// ConsumeInvocations pulls messages in batches of up to size, waiting at most
// wait for a batch to fill, and hands each batch to fn. A batch fn accepts
// is acknowledged; one it rejects is redelivered, to this server or another.
// Every server calls this: they share one consumer, so each record reaches
// one of them. It returns when ctx ends.
func (b *Bus) ConsumeInvocations(ctx context.Context, size int, wait time.Duration, fn func(context.Context, []Message) error) error {
	js, err := jetstream.New(b.nc)
	if err != nil {
		return err
	}
	cons, err := js.CreateOrUpdateConsumer(ctx, InvocationStream, jetstream.ConsumerConfig{
		Durable:       recordConsumer,
		FilterSubject: "invocations.>",
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       recordAckWait,
		MaxAckPending: -1,
	})
	if err != nil {
		return fmt.Errorf("bus: invocation consumer: %w", err)
	}
	for ctx.Err() == nil {
		batch, err := cons.Fetch(size, jetstream.FetchMaxWait(wait))
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("bus: fetch invocations: %w", err)
		}
		var msgs []jetstream.Msg
		var recs []Message
		for m := range batch.Messages() {
			msgs = append(msgs, m)
			recs = append(recs, Message{Subject: m.Subject(), Data: m.Data()})
		}
		if err := batch.Error(); err != nil && !errors.Is(err, context.DeadlineExceeded) && ctx.Err() == nil {
			return fmt.Errorf("bus: fetch invocations: %w", err)
		}
		if len(recs) == 0 {
			continue
		}
		if err := fn(ctx, recs); err != nil {
			for _, m := range msgs {
				_ = m.NakWithDelay(time.Second)
			}
			continue
		}
		for _, m := range msgs {
			_ = m.Ack()
		}
	}
	return nil
}
