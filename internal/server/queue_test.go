package server

import (
	"context"
	"log/slog"
	"reflect"
	"testing"
	"time"

	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
)

// A call's deadline bounds how long the queue keeps its invocation, so it
// never passes InvokeMaxDeadline, which is the stream's MaxAge.
func TestDeadline(t *testing.T) {
	s := &Service{cfg: Config{InvokeDeadline: 5 * time.Minute, InvokeMaxDeadline: time.Hour}}
	tests := []struct {
		name   string
		caller time.Duration // 0 sets no deadline
		want   time.Duration
	}{
		{"caller sets none", 0, 5 * time.Minute},
		{"caller sets a shorter one", 10 * time.Second, 10 * time.Second},
		{"caller sets one longer than the default", 30 * time.Minute, 30 * time.Minute},
		{"caller sets one past the cap", 3 * time.Hour, time.Hour},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			if tt.caller > 0 {
				var cancel context.CancelFunc
				ctx, cancel = context.WithTimeout(ctx, tt.caller)
				defer cancel()
			}
			got := time.Until(s.deadline(ctx))
			if d := got - tt.want; d < -time.Second || d > time.Second {
				t.Errorf("deadline in %v, want about %v", got, tt.want)
			}
		})
	}
}

func resultFor(t *testing.T, id string) []byte {
	t.Helper()
	data, err := proto.Marshal(&hostv1.InvokeResult{InvocationId: id})
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestOnResultReachesItsCall(t *testing.T) {
	a, b := make(chan *hostv1.InvokeResult, 1), make(chan *hostv1.InvokeResult, 1)
	s := &Service{log: slog.New(slog.DiscardHandler), waiting: map[string]chan *hostv1.InvokeResult{"a": a, "b": b}}

	s.onResult(context.Background(), resultFor(t, "b"))

	select {
	case res := <-b:
		if res.GetInvocationId() != "b" {
			t.Errorf("call b got %q", res.GetInvocationId())
		}
	default:
		t.Fatal("call b got no result")
	}
	select {
	case res := <-a:
		t.Fatalf("call a got %q", res.GetInvocationId())
	default:
	}
}

func TestOnResultDropsWhatNoCallWaitsOn(t *testing.T) {
	full := make(chan *hostv1.InvokeResult, 1)
	full <- &hostv1.InvokeResult{InvocationId: "first"}
	s := &Service{log: slog.New(slog.DiscardHandler), waiting: map[string]chan *hostv1.InvokeResult{"dup": full}}

	tests := []struct {
		name string
		data []byte
	}{
		{"caller gave up", resultFor(t, "gone")},
		{"undecodable", []byte{0xff, 0xff, 0xff}},
		// A second result for one call, as after a redelivery, must not
		// block the subscription.
		{"second result", resultFor(t, "dup")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			done := make(chan struct{})
			go func() {
				if reply := s.onResult(context.Background(), tt.data); reply != nil {
					t.Errorf("onResult replied %v", reply)
				}
				close(done)
			}()
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("onResult blocked")
			}
		})
	}
	if res := <-full; res.GetInvocationId() != "first" {
		t.Errorf("first result replaced by %q", res.GetInvocationId())
	}
}

func TestHostsByLoad(t *testing.T) {
	now := time.Now()
	host := func(busy int32, seen time.Time) *knownHost {
		return &knownHost{host: &functionsv1.Host{SlotsInUse: busy}, seen: seen}
	}
	s := &Service{
		cfg: Config{HostTTL: 10 * time.Second},
		hosts: map[string]*knownHost{
			"c":     host(1, now),
			"b":     host(0, now),
			"a":     host(1, now),
			"stale": host(0, now.Add(-time.Minute)),
		},
	}
	// Fewest busy first, ties by name, stale hosts left out.
	want := []string{"b", "a", "c"}
	if got := s.hostsByLoad(); !reflect.DeepEqual(got, want) {
		t.Errorf("hostsByLoad() = %v, want %v", got, want)
	}
}
