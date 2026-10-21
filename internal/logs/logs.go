// Package logs keeps what functions write to stderr. While an invocation
// runs, its host sends each piece to the bus, where the latest pieces stay
// for live and recent reads, and streams all of it, gzipped, into one object
// in the log bucket, completed when the invocation ends. The bucket is the
// lasting copy; its own lifecycle rules move old logs to colder storage.
package logs

import (
	"compress/gzip"
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"time"

	"gocloud.dev/blob"
	// Bucket URLs: s3://, gs:// and file://.
	_ "gocloud.dev/blob/fileblob"
	_ "gocloud.dev/blob/gcsblob"
	_ "gocloud.dev/blob/s3blob"
	"gocloud.dev/gcerrors"
)

// uploadPartBytes is how much of a log is held in memory before it is
// uploaded as one part. 5 MiB is the smallest part S3 allows. A log shorter
// than that is uploaded in one request when the invocation ends.
const uploadPartBytes = 5 << 20

// OpenBucket opens the log bucket at url, such as s3://bucket?region=...,
// gs://bucket or file:///var/lib/alchemy/logs?create_dir=1. An empty url
// means no bucket: logs are only kept as long as the bus keeps them.
func OpenBucket(ctx context.Context, url string) (*blob.Bucket, error) {
	if url == "" {
		return nil, nil
	}
	return blob.OpenBucket(ctx, url)
}

// Key is where an invocation's log is kept in the bucket: by tenant, function
// and the UTC day the invocation was created, so one prefix lists a
// function's logs for a day.
func Key(tenantID, functionID string, created time.Time, invocationID string) string {
	return tenantID + "/" + functionID + "/" + created.UTC().Format("2006/01/02") + "/" + invocationID + ".log.gz"
}

// Writer takes one invocation's log as the function writes it: each piece
// goes to publish, and all of it to the bucket. A failing bucket is logged
// once and stops only the upload; the function never sees an error.
type Writer struct {
	publish func([]byte) error
	log     *slog.Logger

	mu     sync.Mutex
	cancel context.CancelFunc
	upload *blob.Writer
	gz     *gzip.Writer
}

// NewWriter starts the upload of an invocation's log to key in bucket, if
// there is a bucket. ctx bounds the upload.
func NewWriter(ctx context.Context, bucket *blob.Bucket, key string, publish func([]byte) error, log *slog.Logger) *Writer {
	w := &Writer{publish: publish, log: log}
	if bucket == nil {
		return w
	}
	ctx, w.cancel = context.WithCancel(ctx)
	upload, err := bucket.NewWriter(ctx, key, &blob.WriterOptions{
		ContentType:    "application/gzip",
		BufferSize:     uploadPartBytes,
		MaxConcurrency: 1,
	})
	if err != nil {
		w.fail("start log upload", err)
		return w
	}
	w.upload, w.gz = upload, gzip.NewWriter(upload)
	return w
}

func (w *Writer) Write(p []byte) (int, error) {
	if err := w.publish(p); err != nil {
		w.log.Debug("publish log", "err", err)
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.gz != nil {
		if _, err := w.gz.Write(p); err != nil {
			w.abortLocked("upload log", err)
		}
	}
	return len(p), nil
}

// Close completes the upload, which makes the log appear in the bucket.
func (w *Writer) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.gz == nil {
		return nil
	}
	err := errors.Join(w.gz.Close(), w.upload.Close())
	w.gz, w.upload = nil, nil
	w.cancel()
	return err
}

// abortLocked gives up on the upload; nothing appears in the bucket.
func (w *Writer) abortLocked(msg string, err error) {
	w.fail(msg, err)
	w.cancel()
	_ = w.upload.Close()
	w.gz, w.upload = nil, nil
}

func (w *Writer) fail(msg string, err error) {
	w.log.Warn(msg, "err", err)
	if w.cancel != nil {
		w.cancel()
	}
}

// Read streams the log at key to w, uncompressed. It reports found=false
// when the bucket does not have it: no bucket, an upload still running, or
// one that never completed.
func Read(ctx context.Context, bucket *blob.Bucket, key string, w io.Writer) (found bool, err error) {
	if bucket == nil {
		return false, nil
	}
	r, err := bucket.NewReader(ctx, key, nil)
	if gcerrors.Code(err) == gcerrors.NotFound {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer func() { _ = r.Close() }()
	gz, err := gzip.NewReader(r)
	if err != nil {
		return true, err
	}
	_, err = io.Copy(w, gz) //nolint:gosec // streamed to the reader, never held in memory
	return true, err
}
