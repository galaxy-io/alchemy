package logs

import (
	"testing"
	"time"
)

var testTime = time.Date(2026, 11, 5, 23, 0, 0, 0, time.UTC)

func TestAttemptKey(t *testing.T) {
	key := Key("t1", "f1", testTime, "inv-1")
	tests := []struct {
		attempt int32
		want    string
	}{
		{0, key},
		{1, key},
		{2, "t1/f1/2026/11/05/inv-1.2.log.gz"},
		{11, "t1/f1/2026/11/05/inv-1.11.log.gz"},
	}
	for _, tt := range tests {
		if got := AttemptKey(key, tt.attempt); got != tt.want {
			t.Errorf("AttemptKey(%q, %d) = %q, want %q", key, tt.attempt, got, tt.want)
		}
	}
}
