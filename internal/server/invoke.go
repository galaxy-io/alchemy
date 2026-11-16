package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"time"

	"connectrpc.com/connect"
	"github.com/google/go-containerregistry/pkg/name"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/artifact"
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
	return s.invoke(ctx, start, cv, req.Msg)
}

// invoke runs req against cv, the version resolve picked for it, timing it
// from start.
func (s *Service) invoke(ctx context.Context, start time.Time, cv *compiledVersion, req *functionsv1.InvokeRequest) (*connect.Response[functionsv1.InvokeResponse], error) {
	raw, key := req.GetInput(), req.GetIdempotencyKey()
	if err := s.checkCall(raw, key, req.Retries); err != nil {
		return nil, err
	}

	// The invocation is tracked before its key is claimed, so a retry that
	// sees the claim always finds it on this server.
	inv := s.newInvocation(cv, key, int64(len(raw)), false)
	inv.retries = req.Retries
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

// checkCall checks what any call carries against the server's limits.
func (s *Service) checkCall(raw []byte, key string, retries *int32) error {
	if retries != nil {
		if _, err := validRetries(*retries); err != nil {
			return err
		}
	}
	if len(raw) > s.cfg.MaxPayloadBytes {
		return connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("input is %d bytes; the limit is %d", len(raw), s.cfg.MaxPayloadBytes))
	}
	if len(key) > maxIdempotencyKeyLen {
		return connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("idempotency_key is %d bytes; the limit is %d", len(key), maxIdempotencyKeyLen))
	}
	return nil
}

// run announces one tracked invocation, sends it to a host and returns its
// result.
func (s *Service) run(ctx context.Context, start time.Time, inv *invocation, cv *compiledVersion, raw []byte) (*connect.Response[functionsv1.InvokeResponse], error) {
	inv.announce()
	timeout := cv.timeout
	accepted := inv.accepted
	key := accepted.GetIdempotencyKey()
	created := time.UnixMilli(accepted.GetCreatedAt())
	hostReq := &hostv1.InvokeRequest{
		Invocation:        accepted,
		Artifact:          cv.artifact,
		Input:             raw,
		TimeoutMs:         timeout.Milliseconds(),
		LogKey:            logs.Key(accepted.GetTenantId(), accepted.GetFunctionId(), created, accepted.GetId()),
		StateSubject:      bus.ServerStateSubject(s.cfg.Name),
		MaxOutputBytes:    int64(s.cfg.MaxPayloadBytes),
		Retries:           inv.retries,
		RetryBackoffMs:    s.cfg.RetryBackoff.Milliseconds(),
		RetryBackoffMaxMs: s.cfg.RetryBackoffMax.Milliseconds(),
	}
	if key != "" {
		hostReq.OutputKey = logs.OutputKey(accepted.GetTenantId(), accepted.GetFunctionId(), created, accepted.GetId())
	}
	res, err := s.dispatch(ctx, inv, cv, hostReq)
	out := res.GetResponse()
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
		Attempts:     res.GetAttempts(),
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

// hostGrace is how long past the function's timeout the server waits for
// a host's record of an invocation it took.
const hostGrace = 15 * time.Second

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
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	fn, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: tenant, ID: functionID})
	if err != nil {
		return nil, notFound(err, "function %q not found", functionID)
	}
	var row *sqlcgen.FunctionVersion
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
	cached, err := s.compiled(row)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	cv := *cached
	cv.timeout = time.Duration(fn.TimeoutMs) * time.Millisecond
	cv.retries = fn.Retries
	// The version was built at the function's resources and network then.
	// When they changed since, the invocation runs as the artifact built at
	// the new ones would be, which a host builds the first time it takes one.
	cv.artifact = artifact.Configure(cv.artifact, functionResources(fn), functionsv1.Network(fn.Network))
	return &cv, nil
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
// result: either the caller stopped waiting, the call's deadline passed, or
// the platform is at fault. dispatch keeps its deadline on a context of its
// own, so err is checked as well as ctx.
func platformError(ctx context.Context, err error) error {
	switch {
	case errors.Is(ctx.Err(), context.Canceled):
		return connect.NewError(connect.CodeCanceled, err)
	case errors.Is(ctx.Err(), context.DeadlineExceeded), errors.Is(err, context.DeadlineExceeded):
		return connect.NewError(connect.CodeDeadlineExceeded, err)
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
	// retries is the call's own retries, when it set them.
	retries *int32
}

// newInvocation starts tracking a new invocation of cv. It is announced on
// the function's live stream when it runs, and discarded if it never does.
func (s *Service) newInvocation(cv *compiledVersion, key string, inputBytes int64, async bool) *invocation {
	inv := &functionsv1.Invocation{
		TenantId:       cv.row.TenantID,
		Id:             newID(),
		FunctionId:     cv.row.FunctionID,
		Version:        cv.row.Version,
		Status:         functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING,
		CreatedAt:      time.Now().UnixMilli(),
		InputBytes:     inputBytes,
		IdempotencyKey: key,
		Async:          async,
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
	if key := i.accepted.GetIdempotencyKey(); key != "" {
		n, err := i.s.store.MarkIdempotencyKeySent(ctx, sqlcgen.MarkIdempotencyKeySentParams{
			TenantID: i.accepted.GetTenantId(), FunctionID: i.accepted.GetFunctionId(),
			Key: key, InvocationID: i.accepted.GetId(), Host: host,
		})
		if err != nil {
			return connect.NewError(connect.CodeUnavailable, fmt.Errorf("mark idempotency key sent: %w", err))
		}
		if n == 0 {
			// A retry took the key over while this call was waiting to send,
			// having found no sign of it. That retry runs; this one must not.
			return keyClaimed()
		}
	}
	i.s.tracker.update(i.accepted.GetId(), func(inv *functionsv1.Invocation) { inv.Host = host })
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
		inv.Attempts = resp.GetAttempts()
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

// Content types of an InvokeHTTP body, by contract.
const (
	jsonContentType  = "application/json"
	arrowContentType = "application/vnd.apache.arrow.stream"
)

// InvokeHTTP serves POST /functions/{function}/invoke: Invoke over plain
// HTTP, where the body is the input and the response body the output, in
// the contract's encoding, with no envelope. ?version= pins a version and
// Idempotency-Key works as on Invoke. Alchemy-Retries sets the call's
// retries, and Alchemy-Attempts answers how many runs the result took.
// With Prefer: respond-async it is
// InvokeAsync instead: 202 with the invocation id and its Location. The
// request must carry the contract's content type, which a browser cannot
// send cross-site without a preflight this server never grants, so a
// session cookie alone cannot invoke.
func (s *Service) InvokeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	ctx := r.Context()
	var version int64
	if v := r.URL.Query().Get("version"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 1 {
			writeError(w, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("version %q is not a version number", v)))
			return
		}
		version = n
	}
	cv, err := s.resolve(ctx, r.PathValue("function"), version)
	if err != nil {
		writeError(w, err)
		return
	}
	retries, err := retriesHeader(r.Header)
	if err != nil {
		writeError(w, err)
		return
	}
	contentType := jsonContentType
	if cv.spec.GetContract().GetArrow() != nil {
		contentType = arrowContentType
	}
	if got, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); got != contentType {
		writeStatus(w, http.StatusUnsupportedMediaType, connect.CodeInvalidArgument,
			fmt.Sprintf("this function takes %s", contentType), nil)
		return
	}
	input, err := io.ReadAll(http.MaxBytesReader(w, r.Body, int64(s.cfg.MaxPayloadBytes)))
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeStatus(w, http.StatusRequestEntityTooLarge, connect.CodeInvalidArgument,
				fmt.Sprintf("input is over the %d byte limit", s.cfg.MaxPayloadBytes), nil)
			return
		}
		writeError(w, connect.NewError(connect.CodeInvalidArgument, err))
		return
	}
	if prefersAsync(r.Header) {
		resp, err := s.invokeAsync(ctx, cv, input, r.Header.Get("Idempotency-Key"), retries)
		if err != nil {
			writeError(w, err)
			return
		}
		writeAccepted(w, resp)
		return
	}
	resp, err := s.invoke(ctx, start, cv, &functionsv1.InvokeRequest{
		FunctionId:     cv.row.FunctionID,
		Version:        version,
		Input:          input,
		IdempotencyKey: r.Header.Get("Idempotency-Key"),
		Retries:        retries,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeInvoked(w, resp.Msg, contentType)
}

// writeInvoked answers a sync call over HTTP: the output in the contract's
// content type, or the function's error as JSON with 500, or 504 when it
// timed out, and what ran in the headers.
func writeInvoked(w http.ResponseWriter, out *functionsv1.InvokeResponse, contentType string) {
	h := w.Header()
	h.Set("Alchemy-Invocation-Id", out.GetInvocationId())
	h.Set("Alchemy-Version", strconv.FormatInt(out.GetVersion(), 10))
	if n := out.GetAttempts(); n > 0 {
		h.Set("Alchemy-Attempts", strconv.Itoa(int(n)))
	}
	if out.GetReplayed() {
		h.Set("Alchemy-Replayed", "true")
	}
	if fe := out.GetError(); fe != nil {
		status := http.StatusInternalServerError
		if fe.GetKind() == functionsv1.FunctionErrorKind_FUNCTION_ERROR_KIND_TIMEOUT {
			status = http.StatusGatewayTimeout
		}
		body, _ := protojson.Marshal(fe)
		h.Set("Content-Type", jsonContentType)
		w.WriteHeader(status)
		_, _ = w.Write(body)
		return
	}
	h.Set("Content-Type", contentType)
	_, _ = w.Write(out.GetOutput())
}

// retriesHeader is the call's Alchemy-Retries, or nil when it sets none.
func retriesHeader(h http.Header) (*int32, error) {
	v := h.Get("Alchemy-Retries")
	if v == "" {
		return nil, nil
	}
	n, err := strconv.ParseInt(v, 10, 32)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("Alchemy-Retries %q is not a number", v))
	}
	retries := int32(n)
	if _, err := validRetries(retries); err != nil {
		return nil, err
	}
	return &retries, nil
}

// writeError answers err as a Connect handler would: its code as the HTTP
// status, and a JSON body with the code, message and any contract
// violations.
func writeError(w http.ResponseWriter, err error) {
	code := connect.CodeOf(err)
	msg := err.Error()
	var violations []json.RawMessage
	if cerr := new(connect.Error); errors.As(err, &cerr) {
		msg = cerr.Message()
		for _, d := range cerr.Details() {
			if v, derr := d.Value(); derr == nil {
				if cv, ok := v.(*functionsv1.ContractViolation); ok {
					b, _ := protojson.Marshal(cv)
					violations = append(violations, b)
				}
			}
		}
	}
	writeStatus(w, httpStatus[code], code, msg, violations)
}

func writeStatus(w http.ResponseWriter, status int, code connect.Code, msg string, violations []json.RawMessage) {
	if status == 0 {
		status = http.StatusInternalServerError
	}
	w.Header().Set("Content-Type", jsonContentType)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		Code       string            `json:"code"`
		Message    string            `json:"message"`
		Violations []json.RawMessage `json:"violations,omitempty"`
	}{code.String(), msg, violations})
}

// httpStatus is the Connect protocol's HTTP status for each code.
var httpStatus = map[connect.Code]int{
	connect.CodeCanceled:           499,
	connect.CodeUnknown:            http.StatusInternalServerError,
	connect.CodeInvalidArgument:    http.StatusBadRequest,
	connect.CodeDeadlineExceeded:   http.StatusGatewayTimeout,
	connect.CodeNotFound:           http.StatusNotFound,
	connect.CodeAlreadyExists:      http.StatusConflict,
	connect.CodePermissionDenied:   http.StatusForbidden,
	connect.CodeResourceExhausted:  http.StatusTooManyRequests,
	connect.CodeFailedPrecondition: http.StatusBadRequest,
	connect.CodeAborted:            http.StatusConflict,
	connect.CodeOutOfRange:         http.StatusBadRequest,
	connect.CodeUnimplemented:      http.StatusNotImplemented,
	connect.CodeInternal:           http.StatusInternalServerError,
	connect.CodeUnavailable:        http.StatusServiceUnavailable,
	connect.CodeDataLoss:           http.StatusInternalServerError,
	connect.CodeUnauthenticated:    http.StatusUnauthorized,
}
