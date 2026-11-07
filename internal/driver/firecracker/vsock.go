package firecracker

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// dialVsock opens a host-initiated vsock connection to the guest. Firecracker
// exposes the device as a Unix socket: the host connects, sends
// "CONNECT <port>\n", and reads "OK <host port>\n" once the guest accepts.
// If nothing listens in the guest yet, Firecracker closes the connection.
func dialVsock(ctx context.Context, socket string, port uint32) (net.Conn, error) {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "unix", socket)
	if err != nil {
		return nil, err
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}
	if _, err := fmt.Fprintf(conn, "CONNECT %d\n", port); err != nil {
		_ = conn.Close()
		return nil, err
	}
	// Read the acknowledgement one byte at a time so nothing the guest sends
	// afterwards is swallowed.
	var line strings.Builder
	buf := make([]byte, 1)
	for line.Len() < 64 {
		if _, err := conn.Read(buf); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("vsock connect: %w", err)
		}
		if buf[0] == '\n' {
			break
		}
		line.WriteByte(buf[0])
	}
	if !strings.HasPrefix(line.String(), "OK ") {
		_ = conn.Close()
		return nil, fmt.Errorf("vsock connect: unexpected reply %q", line.String())
	}
	_ = conn.SetDeadline(time.Time{})
	return conn, nil
}

// waitForGuest dials until the guest's supervisor accepts, which is the
// readiness signal on a cold boot. It fails with errExited once exited is
// closed, since a dead Firecracker never answers.
func waitForGuest(ctx context.Context, socket string, port uint32, exited <-chan struct{}) error {
	tick := time.NewTicker(2 * time.Millisecond)
	defer tick.Stop()
	for {
		attempt, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
		conn, err := dialVsock(attempt, socket, port)
		cancel()
		if err == nil {
			return conn.Close()
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("%w (last error: %v)", ctx.Err(), err)
		case <-exited:
			return errExited
		case <-tick.C:
		}
	}
}
