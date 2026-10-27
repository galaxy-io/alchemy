package logs

import (
	"bytes"
	"context"
	"io"
	"strings"
	"time"

	"gocloud.dev/blob"
	"gocloud.dev/gcerrors"
)

// Outputs live in the same bucket as logs, next to the log of the
// invocation that produced them, and only for invocations whose caller
// asked for a replayable result.

// OutputKey is where an invocation's output is kept in the bucket.
func OutputKey(tenantID, functionID string, created time.Time, invocationID string) string {
	return strings.TrimSuffix(Key(tenantID, functionID, created, invocationID), ".log.gz") + ".out"
}

// WriteOutput stores out at key. With no bucket it does nothing.
func WriteOutput(ctx context.Context, bucket *blob.Bucket, key string, out []byte) error {
	if bucket == nil {
		return nil
	}
	return bucket.WriteAll(ctx, key, out, &blob.WriterOptions{ContentType: "application/octet-stream"})
}

// ReadOutput returns the output at key. It reports found=false when the
// bucket does not have it: no bucket, or an upload not yet complete.
func ReadOutput(ctx context.Context, bucket *blob.Bucket, key string) (out []byte, found bool, err error) {
	if bucket == nil {
		return nil, false, nil
	}
	r, err := bucket.NewReader(ctx, key, nil)
	if gcerrors.Code(err) == gcerrors.NotFound {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = r.Close() }()
	var buf bytes.Buffer
	if _, err := io.Copy(&buf, r); err != nil {
		return nil, true, err
	}
	return buf.Bytes(), true, nil
}
