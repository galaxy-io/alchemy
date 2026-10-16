// Package logger builds the slog.Logger every command binary uses, so they
// all emit one structured format.
//
// Records that belong to one piece of work carry the same keys, so a single
// grep follows it across processes: function_id, version, artifact_id,
// invocation_id, instance_id and host.
package logger

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
)

// New returns a logger writing to w at LOG_LEVEL (DEBUG, INFO, WARN or
// ERROR; INFO by default) in LOG_FORMAT (json or text; json by default). It
// also installs the logger as the process default, so library logs come out
// in the same format.
func New(w io.Writer) (*slog.Logger, error) {
	var level slog.Level
	if s := strings.TrimSpace(os.Getenv("LOG_LEVEL")); s != "" {
		if err := level.UnmarshalText([]byte(s)); err != nil {
			return nil, fmt.Errorf("LOG_LEVEL %q is invalid (DEBUG, INFO, WARN, ERROR)", s)
		}
	}
	opts := &slog.HandlerOptions{Level: level}

	var h slog.Handler
	switch format := strings.ToLower(strings.TrimSpace(os.Getenv("LOG_FORMAT"))); format {
	case "", "json":
		h = slog.NewJSONHandler(w, opts)
	case "text":
		h = slog.NewTextHandler(w, opts)
	default:
		return nil, fmt.Errorf("LOG_FORMAT %q is invalid (json, text)", format)
	}
	l := slog.New(h)
	slog.SetDefault(l)
	return l, nil
}
