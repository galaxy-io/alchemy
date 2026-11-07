package server

import (
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

func TestPrefersAsync(t *testing.T) {
	tests := []struct {
		name   string
		values []string
		want   bool
	}{
		{"absent", nil, false},
		{"respond-async", []string{"respond-async"}, true},
		{"case", []string{"Respond-Async"}, true},
		{"among others", []string{"return=minimal, respond-async"}, true},
		{"with parameters", []string{"respond-async; foo=bar, wait=10"}, true},
		{"second header", []string{"return=minimal", "respond-async"}, true},
		{"other preference", []string{"wait=10"}, false},
		{"prefix only", []string{"respond-asynchronously"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := http.Header{}
			for _, v := range tt.values {
				h.Add("Prefer", v)
			}
			if got := prefersAsync(h); got != tt.want {
				t.Errorf("prefersAsync(%q) = %v, want %v", tt.values, got, tt.want)
			}
		})
	}
}

func TestValidRetries(t *testing.T) {
	for _, n := range []int32{0, 3, maxRetries} {
		if got, err := validRetries(n); err != nil || got != n {
			t.Errorf("validRetries(%d) = %d, %v", n, got, err)
		}
	}
	for _, n := range []int32{-1, maxRetries + 1} {
		if _, err := validRetries(n); connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Errorf("validRetries(%d) error = %v, want INVALID_ARGUMENT", n, err)
		}
	}
}

func TestQueueMaxAgeOutlastsEveryCall(t *testing.T) {
	tests := []Config{
		{InvokeMaxDeadline: time.Hour, AsyncMaxAge: 24 * time.Hour},
		{InvokeMaxDeadline: 48 * time.Hour, AsyncMaxAge: time.Hour},
	}
	for _, cfg := range tests {
		got := queueMaxAge(cfg)
		if got <= cfg.InvokeMaxDeadline || got <= cfg.AsyncMaxAge {
			t.Errorf("queueMaxAge(%v, %v) = %v, not past both", cfg.InvokeMaxDeadline, cfg.AsyncMaxAge, got)
		}
	}
}

func TestAttemptEnded(t *testing.T) {
	inv := func(status functionsv1.InvocationStatus, attempts int32, endedAt int64) *functionsv1.Invocation {
		return &functionsv1.Invocation{Status: status, Attempts: attempts, EndedAt: endedAt}
	}
	tests := []struct {
		name    string
		inv     *functionsv1.Invocation
		attempt int32
		want    bool
	}{
		{"sync running", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING, 1, 0), 1, false},
		{"sync ended", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_SUCCEEDED, 1, 1), 1, true},
		{"earlier attempt", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING, 3, 0), 2, true},
		{"latest attempt running", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING, 3, 0), 3, false},
		{"latest attempt failed, next waits", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING, 3, 0), 3, true},
		{"queued, never ran", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING, 0, 0), 1, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := attemptEnded(tt.inv, tt.attempt); got != tt.want {
				t.Errorf("attemptEnded = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNeverRan(t *testing.T) {
	tests := []struct {
		name   string
		status functionsv1.InvocationStatus
		host   string
		want   bool
	}{
		{"errored before queueing", functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, "", true},
		{"expired in the queue", functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED, "", true},
		{"errored on a host", functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, "host-a", false},
		{"marked queued", functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, queuedHost, false},
		{"pending", functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING, "", false},
		{"failed", functionsv1.InvocationStatus_INVOCATION_STATUS_FAILED, "host-a", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inv := &functionsv1.Invocation{Status: tt.status, Host: tt.host}
			if got := neverRan(inv); got != tt.want {
				t.Errorf("neverRan() = %v, want %v", got, tt.want)
			}
		})
	}
}
