package server

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

func TestHostCode(t *testing.T) {
	tests := map[string]connect.Code{
		"resource_exhausted":  connect.CodeResourceExhausted,
		"invalid_argument":    connect.CodeInvalidArgument,
		"unavailable":         connect.CodeUnavailable,
		"not_found":           connect.CodeNotFound,
		"failed_precondition": connect.CodeFailedPrecondition,
		"aborted":             connect.CodeAborted,
		"internal":            connect.CodeInternal,
		"":                    connect.CodeInternal,
		"something new":       connect.CodeInternal,
	}
	for code, want := range tests {
		t.Run(code, func(t *testing.T) {
			if got := hostCode(code); got != want {
				t.Errorf("hostCode(%q) = %v, want %v", code, got, want)
			}
		})
	}
}

func TestPlatformError(t *testing.T) {
	expired, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	canceled, cancel2 := context.WithCancel(context.Background())
	cancel2()

	tests := []struct {
		name string
		ctx  context.Context
		err  error
		want connect.Code
	}{
		{"deadline passed", expired, errors.New("no result"), connect.CodeDeadlineExceeded},
		{"dispatch deadline passed", context.Background(), fmt.Errorf("no result: %w", context.DeadlineExceeded), connect.CodeDeadlineExceeded},
		{"caller went away", canceled, errors.New("no result"), connect.CodeCanceled},
		{"platform at fault", context.Background(), errors.New("no result"), connect.CodeUnavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := platformError(tt.ctx, tt.err)
			if got := connect.CodeOf(err); got != tt.want {
				t.Errorf("code = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestHostMayStillReport(t *testing.T) {
	const timeout = 30 * time.Second
	now := time.Now()
	inv := func(status functionsv1.InvocationStatus, host string, endedAgo time.Duration) *functionsv1.Invocation {
		return &functionsv1.Invocation{Status: status, Host: host, EndedAt: now.Add(-endedAgo).UnixMilli()}
	}
	tests := []struct {
		name string
		inv  *functionsv1.Invocation
		want bool
	}{
		{"errored on a host, just now", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, "h1", time.Second), true},
		{"canceled on a host, just now", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED, "queue", time.Second), true},
		{"errored on a host, past the grace", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, "h1", timeout+hostGrace+time.Second), false},
		{"errored before any host", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, "", time.Second), false},
		{"succeeded", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_SUCCEEDED, "h1", time.Second), false},
		{"failed", inv(functionsv1.InvocationStatus_INVOCATION_STATUS_FAILED, "h1", time.Second), false},
	}
	s := &Service{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := s.hostMayStillReport(tt.inv, timeout+hostGrace); got != tt.want {
				t.Errorf("hostMayStillReport = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestHostWindow(t *testing.T) {
	s := &Service{cfg: Config{RetryBackoff: time.Second, RetryBackoffMax: 5 * time.Minute}}
	tests := []struct {
		retries int32
		want    time.Duration
	}{
		{0, 30*time.Second + hostGrace},
		{2, 3*(30*time.Second+hostGrace) + 1200*time.Millisecond + 6*time.Second},
	}
	for _, tt := range tests {
		cv := &compiledVersion{timeout: 30 * time.Second, retries: tt.retries}
		if got := s.hostWindow(cv); got != tt.want {
			t.Errorf("hostWindow(retries %d) = %v, want %v", tt.retries, got, tt.want)
		}
	}
}
