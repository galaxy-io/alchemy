package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"connectrpc.com/connect"
	"github.com/google/go-containerregistry/pkg/name"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/logs"
)

// errNoHosts is returned when nothing has heartbeated recently.
var errNoHosts = errors.New("no host is available")

// Invoke runs one version against one input and returns its result. Every
// call becomes an Invocation this server holds while it moves through
// PENDING, STARTING, RUNNING and one terminal status; STARTING and RUNNING
// arrive from the host as events, the terminal state with its reply. The
// payload is opaque here: the host checks it against the contract, before
// it spends a slot on the input and after the function wrote the output.
// Nothing is written while it runs: the host publishes its record when it
// ends, and this server publishes one only when no host took it.
func (s *Service) Invoke(ctx context.Context, req *connect.Request[functionsv1.InvokeRequest]) (*connect.Response[functionsv1.InvokeResponse], error) {
	start := time.Now()

	cv, err := s.resolve(ctx, req.Msg.GetFunctionId(), req.Msg.GetVersion())
	if err != nil {
		return nil, err
	}
	raw := req.Msg.GetInput()
	if len(raw) > s.cfg.MaxPayloadBytes {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("input is %d bytes; the limit is %d", len(raw), s.cfg.MaxPayloadBytes))
	}
	key := req.Msg.GetIdempotencyKey()
	if len(key) > maxIdempotencyKeyLen {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("idempotency_key is %d bytes; the limit is %d", len(key), maxIdempotencyKeyLen))
	}

	// The invocation is tracked before its key is claimed, so a retry that
	// sees the claim always finds it on this server.
	inv := s.newInvocation(cv, key, int64(len(raw)))
	if key != "" {
		if s.logs == nil {
			inv.discard()
			return nil, connect.NewError(connect.CodeFailedPrecondition,
				errors.New("idempotency keys need a function logs bucket to keep outputs in"))
		}
		// A keyed call runs only if it is the first with its key: the claim
		// is the one database write on the invocation path, and only keyed
		// calls pay for it.
		held, err := s.claimKey(ctx, cv, key, inv.accepted.GetId())
		if err != nil {
			inv.discard()
			return nil, err
		}
		if held != nil {
			return s.replay(ctx, start, inv, cv, raw, held)
		}
	}
	return s.run(ctx, start, inv, cv, raw)
}

// run announces one tracked invocation, sends it to a host and returns its
// result.
func (s *Service) run(ctx context.Context, start time.Time, inv *invocation, cv *compiledVersion, raw []byte) (*connect.Response[functionsv1.InvokeResponse], error) {
	inv.announce()
	timeout := time.Duration(cv.spec.GetTimeoutMs()) * time.Millisecond
	accepted := inv.accepted
	key := accepted.GetIdempotencyKey()
	created := time.UnixMilli(accepted.GetCreatedAt())
	hostReq := &hostv1.InvokeRequest{
		Invocation:     accepted,
		Artifact:       cv.artifact,
		Input:          raw,
		TimeoutMs:      timeout.Milliseconds(),
		LogKey:         logs.Key(accepted.GetTenantId(), accepted.GetFunctionId(), created, accepted.GetId()),
		StateSubject:   bus.ServerStateSubject(s.cfg.Name),
		MaxOutputBytes: int64(s.cfg.MaxPayloadBytes),
	}
	if key != "" {
		hostReq.OutputKey = logs.OutputKey(accepted.GetTenantId(), accepted.GetFunctionId(), created, accepted.GetId())
	}
	out, err := s.invokeOnHost(ctx, inv, cv, hostReq, timeout)
	if err != nil {
		if ctx.Err() != nil {
			inv.canceled()
		} else {
			inv.errored(err.Error())
		}
		return nil, platformError(ctx, err)
	}
	if e := out.GetError(); e != nil {
		inv.errored(e.GetMessage())
		return nil, connect.NewError(hostCode(e.GetCode()), errors.New(e.GetMessage()))
	}
	if fe := out.GetFunctionError(); fe.GetKind() == functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_INPUT_INVALID {
		inv.rejected(fe)
		return nil, inputViolation(fe.GetViolations())
	}

	resp := &functionsv1.InvokeResponse{
		InvocationId: accepted.GetId(),
		Version:      cv.row.Version,
		Stats: &functionsv1.InvocationStats{
			StartKind: out.GetStartKind(),
			AcquireUs: out.GetAcquireUs(),
			RunUs:     out.GetRunUs(),
			TotalUs:   time.Since(start).Microseconds(),
		},
	}
	setResult(resp, out)
	inv.finished(resp, out)
	return connect.NewResponse(resp), nil
}

// invokeOnHost sends the invocation to the host the placement picks, and
// to the next one when that host turns out to be full, gone or unable to
// build. When no placed host has the artifact, which happens after they all
// restart, the first of them builds it before the invocation is sent. When
// every placed host is full, the invocation waits up to capacityWait for a
// slot, trying them all again with backoff.
func (s *Service) invokeOnHost(ctx context.Context, inv *invocation, cv *compiledVersion, req *hostv1.InvokeRequest, timeout time.Duration) (*hostv1.InvokeResponse, error) {
	wait := capacityBackoff
	deadline := time.Now().Add(capacityWait)
	skip := map[string]bool{}
	var full *hostv1.InvokeResponse
	var unbuilt error
	for {
		c, ok := s.chooseHost(cv, skip)
		switch {
		case !ok && full == nil && unbuilt != nil:
			return nil, connect.NewError(connect.CodeFailedPrecondition, unbuilt)
		case !ok && full == nil:
			return nil, errNoHosts
		case !ok:
			if time.Now().Add(wait).After(deadline) {
				return full, nil
			}
			select {
			case <-ctx.Done():
				return full, nil
			case <-time.After(wait):
			}
			wait = min(wait*2, capacityBackoffMax)
			clear(skip)
			continue
		}
		if !c.built {
			err := s.buildFor(ctx, inv, cv, c.host)
			switch {
			case errors.Is(err, bus.ErrNoResponders):
				// Gone since its last heartbeat.
				s.forgetHost(c.host)
				skip[c.host] = true
				continue
			case err != nil:
				// A build fails for reasons of the host's own as often as the
				// version's, so every placed host gets a try. The call fails
				// as unbuildable only once they all have.
				inv.log.Warn("build on placed host failed", "host", c.host, "err", err)
				skip[c.host] = true
				unbuilt = err
				continue
			}
		}
		// From here the host may run the function, and the record says so
		// until the host answers that it did not.
		if err := inv.sentTo(ctx, c.host); err != nil {
			return nil, err
		}
		out, err := s.requestInvoke(ctx, c.host, req, timeout)
		switch {
		case errors.Is(err, bus.ErrNoResponders):
			// Gone since its last heartbeat.
			inv.notSent()
			s.forgetHost(c.host)
			skip[c.host] = true
			continue
		case err != nil:
			return nil, err
		}
		if e := out.GetError(); e != nil && e.GetCode() != "aborted" {
			inv.notSent()
		}
		switch out.GetError().GetCode() {
		case "resource_exhausted":
			skip[c.host] = true
			full = out
			continue
		case "not_found":
			// Restarted since its last heartbeat: it builds on the next pass.
			if c.built {
				s.noteArtifact(c.host, cv.artifact.GetId(), "", false)
				continue
			}
			return out, nil
		}
		s.noteArtifact(c.host, cv.artifact.GetId(), out.GetInstanceId(), true)
		return out, nil
	}
}

// pinnedSpec is the version's spec with the image pinned to the digest it
// was built against (repo@digest), not the tag: a tag may have moved since,
// and a different image is a different artifact.
func (cv *compiledVersion) pinnedSpec() *functionsv1.FunctionSpec {
	spec := proto.Clone(cv.spec).(*functionsv1.FunctionSpec) //nolint:errcheck // Clone preserves the type
	if cv.row.ImageDigest != "" {
		if ref, err := name.ParseReference(spec.GetImage()); err == nil {
			spec.Image = ref.Context().Digest(cv.row.ImageDigest).String()
		}
	}
	return spec
}

// requestInvoke sends req to host on a fresh budget, so a build that
// ran first takes nothing from it. The host enforces the function timeout
// and its own acquire; the budget only guards against a host that vanished
// mid-call.
func (s *Service) requestInvoke(ctx context.Context, host string, req *hostv1.InvokeRequest, timeout time.Duration) (*hostv1.InvokeResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, invokeBudget(timeout))
	defer cancel()
	out := &hostv1.InvokeResponse{}
	err := s.bus.Request(ctx, bus.HostInvokeSubject(host), req, out)
	return out, err
}

// When every host serving an artifact is full, an invocation waits up to
// capacityWait for a slot, polling with backoff.
const (
	capacityWait       = 30 * time.Second
	capacityBackoff    = 25 * time.Millisecond
	capacityBackoffMax = 500 * time.Millisecond
)

// hostGrace is how long past the function's timeout the server waits for
// a host's reply before treating the host as gone.
const hostGrace = 15 * time.Second

// invokeBudget is the longest the server spends on an invocation with
// timeout once a host has its artifact: waiting for a slot, running it, and
// the host's grace to reply.
func invokeBudget(timeout time.Duration) time.Duration {
	return capacityWait + timeout + hostGrace
}

func hostCode(code string) connect.Code {
	switch code {
	case "resource_exhausted":
		return connect.CodeResourceExhausted
	case "invalid_argument":
		return connect.CodeInvalidArgument
	case "unavailable":
		return connect.CodeUnavailable
	case "not_found":
		return connect.CodeNotFound
	case "failed_precondition":
		return connect.CodeFailedPrecondition
	case "aborted":
		return connect.CodeAborted
	default:
		return connect.CodeInternal
	}
}

// resolve finds the version an invocation should run: the pinned one, or the
// function's current version when n is zero, with its compiled contract and
// artifact.
func (s *Service) resolve(ctx context.Context, functionID string, n int64) (*compiledVersion, error) {
	if _, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: s.tenant, ID: functionID}); err != nil {
		return nil, notFound(err, "function %q not found", functionID)
	}
	var row *sqlcgen.FunctionVersion
	var err error
	if n == 0 {
		row, err = s.store.GetCurrentFunctionVersion(ctx, functionID)
		if err != nil {
			return nil, failedPrecondition(err, "function %q has no ready version", functionID)
		}
	} else {
		row, err = s.store.GetFunctionVersion(ctx, sqlcgen.GetFunctionVersionParams{FunctionID: functionID, Version: n})
		if err != nil {
			return nil, notFound(err, "function %q has no version %d", functionID, n)
		}
		if row.Status != sqlcgen.FunctionVersionStatusReady {
			return nil, connect.NewError(connect.CodeFailedPrecondition,
				fmt.Errorf("version %d of function %q is not ready", n, functionID))
		}
	}
	cv, err := s.compiled(row)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return cv, nil
}

// setResult maps the host's answer, already checked against the contract,
// onto the response.
func setResult(resp *functionsv1.InvokeResponse, out *hostv1.InvokeResponse) {
	if fe := out.GetFunctionError(); fe != nil {
		resp.Result = &functionsv1.InvokeResponse_Error{Error: fe}
		return
	}
	resp.Result = &functionsv1.InvokeResponse_Output{Output: out.GetOutput()}
}

// inputViolation is INVALID_ARGUMENT carrying one detail per violation.
func inputViolation(violations []*functionsv1.ContractViolation) error {
	err := connect.NewError(connect.CodeInvalidArgument, errors.New("input violates the version's input schema"))
	for _, v := range violations {
		if detail, derr := connect.NewErrorDetail(v); derr == nil {
			err.AddDetail(detail)
		}
	}
	return err
}

// platformError classifies a failure in which the function produced no
// result: either the caller stopped waiting or the platform is at fault.
func platformError(ctx context.Context, err error) error {
	switch {
	case errors.Is(ctx.Err(), context.DeadlineExceeded):
		return connect.NewError(connect.CodeDeadlineExceeded, err)
	case errors.Is(ctx.Err(), context.Canceled):
		return connect.NewError(connect.CodeCanceled, err)
	default:
		return connect.NewError(connect.CodeUnavailable, err)
	}
}

func failedPrecondition(err error, format string, args ...any) error {
	if e := notFound(err, format, args...); connect.CodeOf(e) == connect.CodeNotFound {
		return connect.NewError(connect.CodeFailedPrecondition, fmt.Errorf(format, args...))
	}
	return connect.NewError(connect.CodeInternal, err)
}

// invocation is the lifecycle of one Invoke call: each transition updates
// what this server holds and publishes the new state for live streams.
type invocation struct {
	s   *Service
	log *slog.Logger
	// accepted is the invocation as created, which the host completes into
	// its record.
	accepted *functionsv1.Invocation
}

// newInvocation starts tracking a new invocation of cv. It is announced on
// the function's live stream when it runs, and discarded if it never does.
func (s *Service) newInvocation(cv *compiledVersion, key string, inputBytes int64) *invocation {
	inv := &functionsv1.Invocation{
		TenantId:       s.tenant,
		Id:             newID(),
		FunctionId:     cv.row.FunctionID,
		Version:        cv.row.Version,
		Status:         functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING,
		CreatedAt:      time.Now().UnixMilli(),
		InputBytes:     inputBytes,
		IdempotencyKey: key,
	}
	s.tracker.put(inv)
	return &invocation{
		s:        s,
		log:      s.log.With("function_id", cv.row.FunctionID, "version", cv.row.Version, "artifact_id", cv.artifact.GetId(), "invocation_id", inv.GetId()),
		accepted: proto.Clone(inv).(*functionsv1.Invocation), //nolint:errcheck // Clone preserves the type
	}
}

// announce publishes the invocation as accepted, for the live streams.
func (i *invocation) announce() {
	i.s.publishInvocation(i.accepted)
}

// discard forgets an invocation that will not run.
func (i *invocation) discard() {
	i.s.tracker.drop(i.accepted.GetId())
}

// sentTo records the host the invocation is about to go to: on the tracked
// invocation, and for a keyed call on its claim, durably, so that a claim
// with no host is known never to have run even when this server dies.
func (i *invocation) sentTo(ctx context.Context, host string) error {
	i.s.tracker.update(i.accepted.GetId(), func(inv *functionsv1.Invocation) { inv.Host = host })
	if i.accepted.GetIdempotencyKey() == "" {
		return nil
	}
	n, err := i.s.store.MarkIdempotencyKeySent(ctx, sqlcgen.MarkIdempotencyKeySentParams{
		TenantID: i.accepted.GetTenantId(), FunctionID: i.accepted.GetFunctionId(),
		Key: i.accepted.GetIdempotencyKey(), InvocationID: i.accepted.GetId(), Host: host,
	})
	if err != nil {
		return connect.NewError(connect.CodeUnavailable, fmt.Errorf("mark idempotency key sent: %w", err))
	}
	if n == 0 {
		// A retry took the key over while this call was waiting to send,
		// having found no sign of it. That retry runs; this one must not.
		return connect.NewError(connect.CodeAborted, errors.New("idempotency key changed hands; retry"))
	}
	return nil
}

// notSent records that the host answered without running the function.
// The claim keeps its mark; the record this leaves, ended with no host, is
// what lets a retry take the key over.
func (i *invocation) notSent() {
	i.s.tracker.update(i.accepted.GetId(), func(inv *functionsv1.Invocation) { inv.Host = "" })
}

// end applies fn to the tracked invocation, publishes the result and
// returns it. The tracker forgets it a while after.
func (i *invocation) end(fn func(*functionsv1.Invocation)) *functionsv1.Invocation {
	now := time.Now().UnixMilli()
	inv := i.s.tracker.update(i.accepted.GetId(), func(inv *functionsv1.Invocation) {
		fn(inv)
		inv.EndedAt = now
	})
	if inv == nil {
		i.log.Error("invocation was not tracked")
		return nil
	}
	i.s.publishInvocation(inv)
	return inv
}

// finished records the caller's view of a reply from a host. The host
// publishes the record.
func (i *invocation) finished(resp *functionsv1.InvokeResponse, out *hostv1.InvokeResponse) {
	inv := i.end(func(inv *functionsv1.Invocation) {
		inv.Stats = resp.GetStats()
		inv.StartKind = resp.GetStats().GetStartKind()
		inv.InstanceId = out.GetInstanceId()
		if fe := resp.GetError(); fe != nil {
			inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_FAILED
			inv.Error = fe
		} else {
			inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_SUCCEEDED
			inv.OutputBytes = int64(len(resp.GetOutput()))
		}
	})
	i.log.Debug("invocation finished", "status", inv.GetStatus(), "run_us", resp.GetStats().GetRunUs(), "total_us", resp.GetStats().GetTotalUs())
}

// rejected records that the host turned the input away before anything
// ran. The host publishes the record.
func (i *invocation) rejected(fe *functionsv1.FunctionError) {
	i.log.Debug("invocation rejected", "violations", len(fe.GetViolations()))
	i.end(func(inv *functionsv1.Invocation) {
		inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_REJECTED
		inv.Error = fe
	})
}

// errored records a platform failure: no host produced a result, so this
// server's record is the only one.
func (i *invocation) errored(msg string) {
	i.log.Warn("invocation errored", "err", msg)
	if inv := i.end(func(inv *functionsv1.Invocation) {
		inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED
		inv.PlatformError = msg
	}); inv != nil {
		i.s.publishRecord(inv)
	}
}

// canceled records that the caller went away. A host may still run and
// record the invocation, and its record wins.
func (i *invocation) canceled() {
	i.log.Debug("invocation canceled")
	if inv := i.end(func(inv *functionsv1.Invocation) {
		inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED
		inv.PlatformError = "caller went away"
	}); inv != nil {
		i.s.publishRecord(inv)
	}
}
