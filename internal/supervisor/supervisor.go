// Package supervisor implements SupervisorService: the program that sits next
// to the function process, starts it, and relays invocations to it.
package supervisor

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"connectrpc.com/connect"

	supervisorv1 "github.com/galaxy-io/alchemy/api/supervisor/v1"
	"github.com/galaxy-io/alchemy/api/supervisor/v1/supervisorv1connect"
)

const (
	// maxOutputBytes caps what a function may write to stdout.
	maxOutputBytes = 64 << 20
	// stderrTailBytes is how much of stderr goes into a crash's failure
	// message.
	stderrTailBytes = 4 << 10
)

// Service runs one function, one invocation at a time.
type Service struct {
	supervisorv1connect.UnimplementedSupervisorServiceHandler

	// Logs receives the function's stderr. Nil discards it.
	Logs io.Writer

	mu      sync.Mutex
	started bool
	busy    bool
	argv    []string
	env     []string
	dir     string
}

// Start records the function's command and environment. It is called once.
func (s *Service) Start(_ context.Context, req *connect.Request[supervisorv1.StartRequest]) (*connect.Response[supervisorv1.StartResponse], error) {
	msg := req.Msg
	if len(msg.GetArgv()) == 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("argv is required"))
	}
	if msg.GetProtocol() != supervisorv1.Protocol_PROTOCOL_EXEC {
		return nil, connect.NewError(connect.CodeUnimplemented, fmt.Errorf("protocol %s is not implemented", msg.GetProtocol()))
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.started {
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("already started"))
	}
	s.started = true
	s.argv = msg.GetArgv()
	s.dir = msg.GetWorkingDir()
	s.env = make([]string, 0, len(msg.GetEnv()))
	for k, v := range msg.GetEnv() {
		s.env = append(s.env, k+"="+v)
	}
	sort.Strings(s.env)
	return connect.NewResponse(&supervisorv1.StartResponse{}), nil
}

// Invoke runs one invocation; at most one is in flight at a time. The
// function's stderr is sent as it is written, and the result last.
func (s *Service) Invoke(ctx context.Context, req *connect.Request[supervisorv1.InvokeRequest], stream *connect.ServerStream[supervisorv1.InvokeResponse]) error {
	s.mu.Lock()
	switch {
	case !s.started:
		s.mu.Unlock()
		return connect.NewError(connect.CodeFailedPrecondition, errors.New("not started"))
	case s.busy:
		s.mu.Unlock()
		return connect.NewError(connect.CodeFailedPrecondition, errors.New("an invocation is already in flight"))
	}
	s.busy = true
	s.mu.Unlock()

	resume(req.Msg.GetHostTimeMs())
	result, err := s.exec(ctx, req.Msg, logStream{stream})
	// The host hands the instance to the next invocation as soon as it has
	// the result, so the instance is free before the result is sent.
	s.mu.Lock()
	s.busy = false
	s.mu.Unlock()
	if err != nil {
		return err
	}
	return stream.Send(&supervisorv1.InvokeResponse{Event: &supervisorv1.InvokeResponse_Result{Result: result}})
}

// exec runs the function as one process: input on stdin, output on stdout,
// stderr to logs.
func (s *Service) exec(ctx context.Context, req *supervisorv1.InvokeRequest, logs io.Writer) (*supervisorv1.InvokeResult, error) {
	runCtx := ctx
	if ms := req.GetTimeoutMs(); ms > 0 {
		var cancel context.CancelFunc
		runCtx, cancel = context.WithTimeout(ctx, time.Duration(ms)*time.Millisecond)
		defer cancel()
	}

	stdout := &cappedBuffer{max: maxOutputBytes}
	stderr := &tailBuffer{max: stderrTailBytes}

	// Resolve the command against the function's PATH, not this process's:
	// as PID 1 the supervisor has no useful environment of its own.
	cmd := exec.CommandContext(runCtx, lookPath(s.argv[0], s.env), s.argv[1:]...) //nolint:gosec // running the function is the job
	// The invocation's env comes last, so it wins over Start's.
	cmd.Env = slices.Clone(s.env)
	for k, v := range req.GetEnv() {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	cmd.Dir = s.dir
	cmd.Stdin = bytes.NewReader(req.GetInput())
	cmd.Stdout = stdout
	cmd.Stderr = io.MultiWriter(stderr, logs)
	if s.Logs != nil {
		cmd.Stderr = io.MultiWriter(stderr, logs, s.Logs)
	}
	// The function gets its own process group so a timeout takes its
	// children down with it.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
	cmd.WaitDelay = time.Second

	start := time.Now()
	err := cmd.Run()
	result := &supervisorv1.InvokeResult{RunUs: time.Since(start).Microseconds()}
	// Nothing the function started outlives the invocation: the next caller
	// on a warm instance must not share the guest with it.
	if cmd.Process != nil {
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	sweep()
	// A function that exited cleanly while a child it left still held its
	// output open has finished: its output is complete.
	if errors.Is(err, exec.ErrWaitDelay) && cmd.ProcessState != nil && cmd.ProcessState.Success() {
		err = nil
	}

	var exitErr *exec.ExitError
	switch {
	case ctx.Err() != nil:
		// The host went away or gave up; nobody is waiting for a result.
		return nil, connect.NewError(connect.CodeCanceled, ctx.Err())
	case errors.Is(runCtx.Err(), context.DeadlineExceeded):
		result.Result = failure(supervisorv1.FailureKind_FAILURE_KIND_TIMEOUT,
			fmt.Sprintf("function exceeded its %dms timeout", req.GetTimeoutMs()), 0)
	case errors.As(err, &exitErr):
		result.Result = failure(supervisorv1.FailureKind_FAILURE_KIND_CRASHED,
			fmt.Sprintf("function exited with status %d: %s", exitErr.ExitCode(), stderr.String()), int32(min(exitErr.ExitCode(), math.MaxInt32))) //nolint:gosec // clamped
	case err != nil:
		result.Result = failure(supervisorv1.FailureKind_FAILURE_KIND_CRASHED,
			fmt.Sprintf("function could not be run: %v", err), -1)
	case stdout.overflow:
		result.Result = failure(supervisorv1.FailureKind_FAILURE_KIND_CRASHED,
			fmt.Sprintf("function output exceeds %d bytes", maxOutputBytes), 0)
	default:
		result.Result = &supervisorv1.InvokeResult_Output{Output: stdout.Bytes()}
	}
	return result, nil
}

// logStream sends each write as one log event. A send blocks while the host
// is not reading, and with it the function's write.
type logStream struct {
	stream *connect.ServerStream[supervisorv1.InvokeResponse]
}

func (l logStream) Write(p []byte) (int, error) {
	if err := l.stream.Send(&supervisorv1.InvokeResponse{Event: &supervisorv1.InvokeResponse_Log{Log: p}}); err != nil {
		return 0, err
	}
	return len(p), nil
}

// lookPath finds name in the PATH entry of env. It returns name unchanged if
// it contains a slash or is not found, leaving the error to exec.
func lookPath(name string, env []string) string {
	if strings.Contains(name, "/") {
		return name
	}
	for _, kv := range env {
		path, ok := strings.CutPrefix(kv, "PATH=")
		if !ok {
			continue
		}
		for _, dir := range strings.Split(path, ":") {
			candidate := filepath.Join(dir, name)
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
				return candidate
			}
		}
	}
	return name
}

func failure(kind supervisorv1.FailureKind, message string, exitCode int32) *supervisorv1.InvokeResult_Failure {
	return &supervisorv1.InvokeResult_Failure{Failure: &supervisorv1.Failure{
		Kind:     kind,
		Message:  message,
		ExitCode: exitCode,
	}}
}

// cappedBuffer keeps the first max bytes and records whether more arrived.
type cappedBuffer struct {
	bytes.Buffer
	max      int
	overflow bool
}

func (b *cappedBuffer) Write(p []byte) (int, error) {
	if room := b.max - b.Len(); len(p) > room {
		b.overflow = true
		b.Buffer.Write(p[:max(room, 0)])
		return len(p), nil
	}
	return b.Buffer.Write(p)
}

// tailBuffer keeps the last max bytes written to it.
type tailBuffer struct {
	buf []byte
	max int
}

func (b *tailBuffer) Write(p []byte) (int, error) {
	b.buf = append(b.buf, p...)
	if over := len(b.buf) - b.max; over > 0 {
		b.buf = b.buf[over:]
	}
	return len(p), nil
}

func (b *tailBuffer) String() string {
	return string(bytes.TrimSpace(b.buf))
}
