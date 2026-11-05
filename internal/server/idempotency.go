package server

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/logs"
)

// Idempotency keys. A keyed call claims its key in Postgres before it runs,
// so two servers never run the same key twice. A later call with the key
// finds the invocation the claim names, waits for it to end if it has not,
// and answers with its result: the error from its record, the output from
// the bucket, where the host put it before it replied.
//
// The key is released to the next call only when the platform knows the
// function never ran: the invocation ended with no host, or its owner died
// before its claim was marked with one. An invocation a host took but
// never reported on has an unknown outcome, and the key stays held for the
// window.

const (
	maxIdempotencyKeyLen = 255
	// followPoll is how often a waiting call re-reads what the database and
	// the servers hold, in case the event it waits for never comes.
	followPoll     = time.Second
	expireKeysEach = time.Hour
)

// claim is a key's live claim: the invocation holding it, the server that
// made it, and the host the invocation was sent to, if it was.
type claim struct {
	key          string
	invocationID string
	server       string
	host         string
	sentAt       time.Time
	at           time.Time
}

// claimKey claims key for invocation id and returns nil, or returns the
// claim that holds it.
func (s *Service) claimKey(ctx context.Context, cv *compiledVersion, key, id string) (*claim, error) {
	_, err := s.store.ClaimIdempotencyKey(ctx, sqlcgen.ClaimIdempotencyKeyParams{
		TenantID: cv.row.TenantID, FunctionID: cv.row.FunctionID, Key: key, InvocationID: id, Server: s.cfg.Name, Window: s.window(),
	})
	if err == nil {
		return nil, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("claim idempotency key: %w", err))
	}
	held, err := s.heldBy(ctx, cv, key)
	if err != nil {
		return nil, err
	}
	if held == nil {
		// Expired and deleted between the two statements; claim again.
		return s.claimKey(ctx, cv, key, id)
	}
	return held, nil
}

// heldBy returns key's claim, or nil when there is none.
func (s *Service) heldBy(ctx context.Context, cv *compiledVersion, key string) (*claim, error) {
	row, err := s.store.GetIdempotencyKey(ctx, sqlcgen.GetIdempotencyKeyParams{TenantID: cv.row.TenantID, FunctionID: cv.row.FunctionID, Key: key})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("read idempotency key: %w", err))
	}
	return &claim{key: key, invocationID: row.InvocationID, server: row.Server, host: row.Host, sentAt: row.SentAt.Time, at: row.CreatedAt.Time}, nil
}

// replay answers a keyed call with the result of the invocation that holds
// its key, waiting for it to end first. When that invocation never ran,
// this call takes the key over and runs as inv.
func (s *Service) replay(ctx context.Context, start time.Time, inv *invocation, cv *compiledVersion, raw []byte, held *claim) (*connect.Response[functionsv1.InvokeResponse], error) {
	prior, err := s.outcome(ctx, cv, held)
	if err != nil {
		inv.discard()
		return nil, err
	}
	if prior == nil {
		return s.takeOver(ctx, start, inv, cv, raw, held)
	}
	switch prior.GetStatus() {
	case functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED:
		if prior.GetHost() == "" {
			return s.takeOver(ctx, start, inv, cv, raw, held)
		}
		inv.discard()
		return nil, connect.NewError(connect.CodeAborted,
			fmt.Errorf("invocation %s was sent to host %s and its outcome is unknown; the key is held, use a new key to run again", prior.GetId(), prior.GetHost()))
	case functionsv1.InvocationStatus_INVOCATION_STATUS_REJECTED:
		inv.discard()
		return nil, inputViolation(prior.GetError().GetViolations())
	default:
	}
	inv.discard()
	resp := &functionsv1.InvokeResponse{InvocationId: prior.GetId(), Version: prior.GetVersion(), Stats: prior.GetStats(), Replayed: true}
	if fe := prior.GetError(); fe != nil {
		resp.Result = &functionsv1.InvokeResponse_Error{Error: fe}
		return connect.NewResponse(resp), nil
	}
	out, err := s.replayOutput(ctx, prior)
	if err != nil {
		return nil, err
	}
	resp.Result = &functionsv1.InvokeResponse_Output{Output: out}
	return connect.NewResponse(resp), nil
}

// takeOver moves held's key to inv, whose invocation then runs. When
// another call took it over first, that call's invocation is replayed
// instead.
func (s *Service) takeOver(ctx context.Context, start time.Time, inv *invocation, cv *compiledVersion, raw []byte, held *claim) (*connect.Response[functionsv1.InvokeResponse], error) {
	key := inv.accepted.GetIdempotencyKey()
	n, err := s.store.TakeOverIdempotencyKey(ctx, sqlcgen.TakeOverIdempotencyKeyParams{
		TenantID: cv.row.TenantID, FunctionID: cv.row.FunctionID, Key: key,
		NewInvocationID: inv.accepted.GetId(), Server: s.cfg.Name, OldInvocationID: held.invocationID,
	})
	if err != nil {
		inv.discard()
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("take over idempotency key: %w", err))
	}
	if n == 0 {
		now, err := s.heldBy(ctx, cv, key)
		if err != nil || now == nil || now.invocationID == held.invocationID {
			inv.discard()
			return nil, connect.NewError(connect.CodeAborted, errors.New("idempotency key changed hands; retry"))
		}
		return s.replay(ctx, start, inv, cv, raw, now)
	}
	return s.run(ctx, start, inv, cv, raw)
}

// outcome waits for the invocation holding held to end and returns it. It
// returns nil when the invocation is nowhere and never ran: its owner went
// away before queueing it. When the claim is marked and the invocation is
// nowhere, a host's record is waited for as long as a queued invocation
// may still be taken and run, and past it the outcome is unknown, whether
// or not the owner is live: a live owner that still had it would have
// answered for it.
//
// It wakes on the function's live stream and re-reads durable state on a
// tick, so an owner that dies mid-way does not strand it: the host still
// records what it ran. A record a server wrote for an invocation a host
// took is not the end of the story until the host's deadline passes.
func (s *Service) outcome(ctx context.Context, cv *compiledVersion, held *claim) (*functionsv1.Invocation, error) {
	wake := make(chan struct{}, 1)
	sub, err := s.bus.Subscribe(ctx, bus.InvocationSubject(cv.row.FunctionID), "", func(_ context.Context, data []byte) proto.Message {
		ev := &functionsv1.Invocation{}
		if err := proto.Unmarshal(data, ev); err == nil && ev.GetId() == held.invocationID && terminal(ev.GetStatus()) {
			select {
			case wake <- struct{}{}:
			default:
			}
		}
		return nil
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeUnavailable, err)
	}
	defer sub.Unsubscribe()

	timeout := cv.timeout
	for {
		inv, err := s.invocation(ctx, held.invocationID)
		if err != nil && connect.CodeOf(err) == connect.CodeNotFound {
			// The claim is read again before anything is decided on it: its
			// owner may have marked it since.
			now, cerr := s.heldBy(ctx, cv, held.key)
			if cerr != nil {
				return nil, cerr
			}
			if now == nil || now.invocationID != held.invocationID {
				return nil, connect.NewError(connect.CodeAborted, errors.New("idempotency key changed hands; retry"))
			}
			held = now
		}
		switch {
		case err != nil && connect.CodeOf(err) != connect.CodeNotFound:
			return nil, err
		case err == nil && terminal(inv.GetStatus()) && !s.hostMayStillReport(inv, timeout):
			return inv, nil
		case err != nil && !s.serverLive(held.server) && held.host == "":
			return nil, nil
		case err != nil && time.Since(held.sentAt) > s.cfg.InvokeMaxDeadline+timeout+hostGrace:
			return nil, connect.NewError(connect.CodeAborted,
				fmt.Errorf("invocation %s was sent to host %s by a server that is gone, and its outcome is unknown; the key is held, use a new key to run again", held.invocationID, held.host))
		}
		select {
		case <-wake:
		case <-time.After(followPoll):
		case <-ctx.Done():
			return nil, platformError(ctx, fmt.Errorf("waiting for invocation %s: %w", held.invocationID, ctx.Err()))
		}
	}
}

// hostMayStillReport is true for a server's record of an invocation a host
// took and has not yet reported on: the host's record, which overrides it,
// may still arrive until the function's timeout and the host's grace pass.
func (s *Service) hostMayStillReport(inv *functionsv1.Invocation, timeout time.Duration) bool {
	switch inv.GetStatus() {
	case functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED, functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED:
	default:
		return false
	}
	if inv.GetHost() == "" {
		return false
	}
	return time.Since(time.UnixMilli(inv.GetEndedAt())) < timeout+hostGrace
}

// serverLive reports whether name heartbeated within HostTTL. A process
// restarted under the same name counts as live, which is why a starting
// server releases the unsent claims in its name first.
func (s *Service) serverLive(name string) bool {
	return name == s.cfg.Name || slices.Contains(s.liveServers(), name)
}

// replayOutput reads inv's output from the bucket, where the host put it
// before it replied. An output that is not there was never kept: the
// function ran, its result is gone, and the key stays held like any other
// outcome the platform cannot reproduce.
func (s *Service) replayOutput(ctx context.Context, inv *functionsv1.Invocation) ([]byte, error) {
	key := logs.OutputKey(inv.GetTenantId(), inv.GetFunctionId(), time.UnixMilli(inv.GetCreatedAt()), inv.GetId())
	out, found, err := logs.ReadOutput(ctx, s.logs, key)
	switch {
	case err != nil:
		return nil, connect.NewError(connect.CodeUnavailable, fmt.Errorf("read output of invocation %s: %w", inv.GetId(), err))
	case !found:
		return nil, connect.NewError(connect.CodeAborted,
			fmt.Errorf("invocation %s succeeded but its output was not kept; the key is held, use a new key to run again", inv.GetId()))
	}
	return out, nil
}

// window is the idempotency window as Postgres sees it.
func (s *Service) window() pgtype.Interval {
	return pgtype.Interval{Microseconds: s.cfg.IdempotencyWindow.Microseconds(), Valid: true}
}

// expireKeys deletes idempotency keys past the window, now and then, until
// the service stops. Every server does it; the deletes do not conflict.
func (s *Service) expireKeys() {
	ticker := time.NewTicker(expireKeysEach)
	defer ticker.Stop()
	for {
		select {
		case <-s.background.Done():
			return
		case <-ticker.C:
			if _, err := s.store.DeleteExpiredIdempotencyKeys(s.background, s.window()); err != nil {
				s.log.Warn("expire idempotency keys", "err", err)
			}
		}
	}
}
