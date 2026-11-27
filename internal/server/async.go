package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/encoding/protojson"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/logs"
)

// InvokeAsync queues one invocation and returns its id. A host runs it,
// again after each failed attempt up to the call's or the function's
// retries, and records every attempt. Its output is dropped.
func (s *Service) InvokeAsync(ctx context.Context, req *connect.Request[functionsv1.InvokeAsyncRequest]) (*connect.Response[functionsv1.InvokeAsyncResponse], error) {
	cv, err := s.resolve(ctx, req.Msg.GetFunctionId(), req.Msg.GetVersion())
	if err != nil {
		return nil, err
	}
	resp, err := s.invokeAsync(ctx, cv, req.Msg.GetInput(), req.Msg.GetIdempotencyKey(), req.Msg.Retries)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

// invokeAsync queues raw for cv. A key an earlier call claimed returns that
// call's invocation instead, unless it was never queued.
func (s *Service) invokeAsync(ctx context.Context, cv *compiledVersion, raw []byte, key string, retries *int32) (*functionsv1.InvokeAsyncResponse, error) {
	if err := s.checkCall(raw, key, retries); err != nil {
		return nil, err
	}
	inv := s.newInvocation(cv, key, int64(len(raw)), true)
	inv.retries = retries
	if key == "" {
		return s.queueAsync(ctx, inv, cv, raw)
	}
	held, err := s.claimKey(ctx, cv, key, inv.accepted.GetId())
	if err != nil {
		inv.discard()
		return nil, err
	}
	for held != nil {
		abandoned, err := s.abandoned(ctx, held)
		if err != nil {
			inv.discard()
			return nil, err
		}
		if !abandoned {
			inv.discard()
			return &functionsv1.InvokeAsyncResponse{InvocationId: held.invocationID, Replayed: true}, nil
		}
		n, err := s.store.TakeOverIdempotencyKey(ctx, sqlcgen.TakeOverIdempotencyKeyParams{
			TenantID: cv.row.TenantID, FunctionID: cv.row.FunctionID, Key: key,
			NewInvocationID: inv.accepted.GetId(), Server: s.cfg.Name, OldInvocationID: held.invocationID,
		})
		if err != nil {
			inv.discard()
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("take over idempotency key: %w", err))
		}
		if n > 0 {
			break
		}
		if held, err = s.heldBy(ctx, cv, key); err != nil {
			inv.discard()
			return nil, err
		}
		if held == nil {
			inv.discard()
			return nil, keyClaimed()
		}
	}
	return s.queueAsync(ctx, inv, cv, raw)
}

// abandoned reports whether the invocation holding held was never queued,
// so a call may take its key over: it ended with no host, as when marking
// the claim or publishing it failed, or it is nowhere and its owner died
// before marking the claim. Any other holder is the call's answer.
func (s *Service) abandoned(ctx context.Context, held *claim) (bool, error) {
	inv, err := s.invocation(ctx, held.invocationID)
	switch {
	case err == nil:
		return neverRan(inv), nil
	case connect.CodeOf(err) != connect.CodeNotFound:
		return false, err
	}
	return held.host == "" && !s.serverLive(held.server), nil
}

// neverRan is true for an invocation that ended before any host took it.
func neverRan(inv *functionsv1.Invocation) bool {
	switch inv.GetStatus() {
	case functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED:
		return inv.GetHost() == ""
	default:
		return false
	}
}

// queueAsync publishes inv to the queue with no server waiting on it, and
// records it as pending, so it is found while it waits whatever happens to
// this server.
func (s *Service) queueAsync(ctx context.Context, inv *invocation, cv *compiledVersion, raw []byte) (*functionsv1.InvokeAsyncResponse, error) {
	inv.announce()
	accepted := inv.accepted
	created := time.UnixMilli(accepted.GetCreatedAt())
	req := &hostv1.InvokeRequest{
		Invocation:        accepted,
		Artifact:          cv.artifact,
		Input:             raw,
		TimeoutMs:         cv.timeout.Milliseconds(),
		LogKey:            logs.Key(accepted.GetTenantId(), accepted.GetFunctionId(), created, accepted.GetId()),
		MaxOutputBytes:    int64(s.cfg.MaxPayloadBytes),
		DeadlineMs:        created.Add(s.cfg.AsyncMaxAge).UnixMilli(),
		Build:             buildFor(cv),
		Async:             true,
		Retries:           inv.retries,
		RetryBackoffMs:    s.cfg.RetryBackoff.Milliseconds(),
		RetryBackoffMaxMs: s.cfg.RetryBackoffMax.Milliseconds(),
	}
	if err := inv.sentTo(ctx, queuedHost); err != nil {
		inv.errored(err.Error())
		inv.countUnserved(ctx)
		return nil, err
	}
	if err := s.queue.Publish(ctx, req); err != nil {
		inv.notSent()
		inv.errored(err.Error())
		inv.countUnserved(ctx)
		return nil, platformError(ctx, err)
	}
	if rec := s.tracker.settle(accepted.GetId()); rec != nil {
		rec.Host = ""
		s.publishRecord(rec)
	}
	return &functionsv1.InvokeAsyncResponse{InvocationId: accepted.GetId()}, nil
}

// prefersAsync reports whether the request's Prefer header asks for
// respond-async (RFC 7240).
func prefersAsync(h http.Header) bool {
	for _, v := range h.Values("Prefer") {
		for pref := range strings.SplitSeq(v, ",") {
			name, _, _ := strings.Cut(pref, ";")
			if strings.EqualFold(strings.TrimSpace(name), "respond-async") {
				return true
			}
		}
	}
	return false
}

// writeAccepted answers an async call over HTTP: 202, where to follow the
// invocation, and its id in the body.
func writeAccepted(w http.ResponseWriter, resp *functionsv1.InvokeAsyncResponse) {
	h := w.Header()
	h.Set("Preference-Applied", "respond-async")
	h.Set("Location", "/invocations/"+resp.GetInvocationId())
	h.Set("Alchemy-Invocation-Id", resp.GetInvocationId())
	if resp.GetReplayed() {
		h.Set("Alchemy-Replayed", "true")
	}
	body, _ := protojson.Marshal(resp)
	h.Set("Content-Type", jsonContentType)
	w.WriteHeader(http.StatusAccepted)
	_, _ = w.Write(body) //nolint:gosec // protojson of a server-made id, served as application/json
}
