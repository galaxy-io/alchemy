package bus

import (
	"testing"
	"time"
)

func TestLeaseValueRoundTrip(t *testing.T) {
	tests := []time.Time{
		time.UnixMilli(0),
		time.UnixMilli(1),
		time.Date(2026, 11, 5, 12, 0, 0, 123_000_000, time.UTC),
		time.Date(2200, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	for _, until := range tests {
		t.Run(until.String(), func(t *testing.T) {
			v := leaseValue(until)
			if len(v) != 8 {
				t.Fatalf("value is %d bytes, want 8", len(v))
			}
			if got := leaseExpiry(v); !got.Equal(until) {
				t.Errorf("leaseExpiry(leaseValue(%v)) = %v", until, got)
			}
		})
	}
}

// Expiry has millisecond precision and never lands after the time given,
// so a lease is never judged live for longer than its holder asked.
func TestLeaseValueTruncates(t *testing.T) {
	until := time.UnixMilli(1000).Add(999 * time.Microsecond)
	if got, want := leaseExpiry(leaseValue(until)), time.UnixMilli(1000); !got.Equal(want) {
		t.Errorf("expiry = %v, want %v", got, want)
	}
}
