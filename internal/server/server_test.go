package server

import (
	"testing"
	"time"
)

func TestConfigValidate(t *testing.T) {
	tests := []struct {
		name      string
		base, max time.Duration
		ok        bool
	}{
		{"defaults", time.Second, 5 * time.Minute, true},
		{"equal", time.Minute, time.Minute, true},
		{"at the cap", time.Hour, time.Hour, true},
		{"zero base", 0, time.Minute, false},
		{"negative base", -time.Second, time.Minute, false},
		{"max under base", time.Minute, time.Second, false},
		{"max over the cap", time.Second, 2 * time.Hour, false},
		{"base over the cap", 2 * time.Hour, 2 * time.Hour, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := DefaultConfig()
			cfg.RetryBackoff, cfg.RetryBackoffMax = tt.base, tt.max
			if err := cfg.Validate(); (err == nil) != tt.ok {
				t.Errorf("Validate() = %v, want ok %v", err, tt.ok)
			}
		})
	}
}
