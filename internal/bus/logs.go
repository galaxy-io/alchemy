package bus

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// Function logs. Hosts publish each piece of an invocation's stderr on its
// own subject as the function writes it; a JetStream stream keeps the
// latest pieces of every invocation for a while, so the server can replay
// and follow them. The full log goes to the log bucket, not here.
const (
	// LogStream is the stream that keeps recent log pieces.
	LogStream = "LOGS"
	// logWindow is how many pieces of each invocation the stream keeps; the
	// supervisor sends at most 32 KiB at a time, so about the latest 10 MiB.
	logWindow = 320
	// logEndHeader marks the message that ends an invocation's log.
	logEndHeader = "Alchemy-Log-End"
)

// LogSubject carries the log of one invocation.
func LogSubject(tenantID, invocationID string) string {
	return "logs." + tenantID + "." + invocationID
}

// LogStreamConfig sizes the stream of recent log pieces.
type LogStreamConfig struct {
	// MaxAge is how long a piece is kept.
	MaxAge time.Duration
	// MaxBytes bounds the whole stream; the oldest pieces go first.
	MaxBytes int64
}

// EnsureLogStream creates the stream of recent log pieces, or brings an
// existing one to cfg. It lives in memory: the log bucket is what keeps
// logs, so a NATS restart loses nothing a finished invocation needs.
func (b *Bus) EnsureLogStream(ctx context.Context, cfg LogStreamConfig) error {
	js, err := jetstream.New(b.nc)
	if err != nil {
		return err
	}
	_, err = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:              LogStream,
		Subjects:          []string{"logs.>"},
		Storage:           jetstream.MemoryStorage,
		MaxAge:            cfg.MaxAge,
		MaxBytes:          cfg.MaxBytes,
		MaxMsgsPerSubject: logWindow,
		Discard:           jetstream.DiscardOld,
	})
	if err != nil {
		return fmt.Errorf("bus: log stream: %w", err)
	}
	return nil
}

// PublishLog sends the next piece of the log on subject.
func (b *Bus) PublishLog(subject string, data []byte) error {
	return b.nc.Publish(subject, data)
}

// EndLog marks the log on subject as complete.
func (b *Bus) EndLog(subject string) error {
	msg := nats.NewMsg(subject)
	msg.Header.Set(logEndHeader, "1")
	return b.nc.PublishMsg(msg)
}

// ReadLog calls fn with each piece of the log on subject that the stream
// still holds, in order. Without follow it returns once it has caught up.
// With follow it waits for more until the log ends, checking ended each time
// it has waited a second for a log whose end marker may never come.
func (b *Bus) ReadLog(ctx context.Context, subject string, follow bool, ended func() bool, fn func([]byte) error) error {
	js, err := jetstream.New(b.nc)
	if err != nil {
		return err
	}
	cons, err := js.OrderedConsumer(ctx, LogStream, jetstream.OrderedConsumerConfig{
		FilterSubjects: []string{subject},
		DeliverPolicy:  jetstream.DeliverAllPolicy,
	})
	if err != nil {
		return fmt.Errorf("bus: read log: %w", err)
	}
	info, err := cons.Info(ctx)
	if err != nil {
		return fmt.Errorf("bus: read log: %w", err)
	}
	if info.NumPending == 0 && !follow {
		return nil
	}
	msgs, err := cons.Messages()
	if err != nil {
		return fmt.Errorf("bus: read log: %w", err)
	}
	defer msgs.Stop()
	for {
		wait, cancel := context.WithTimeout(ctx, time.Second)
		msg, err := msgs.Next(jetstream.NextContext(wait))
		cancel()
		switch {
		case ctx.Err() != nil:
			return ctx.Err()
		case errors.Is(err, context.DeadlineExceeded):
			if !follow || ended() {
				return nil
			}
			continue
		case err != nil:
			return fmt.Errorf("bus: read log: %w", err)
		}
		if msg.Headers().Get(logEndHeader) != "" {
			return nil
		}
		if err := fn(msg.Data()); err != nil {
			return err
		}
		if meta, err := msg.Metadata(); err == nil && meta.NumPending == 0 && !follow {
			return nil
		}
	}
}
