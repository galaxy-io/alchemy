package server

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
)

const (
	// recordBatch is how many stream messages, each a batch of records, a
	// server takes per write.
	recordBatch = 200
	// recordWait is how long a server waits for a batch to fill.
	recordWait = 100 * time.Millisecond
)

// record writes invocation records from the stream to the database until
// the service stops. Every server runs it; the stream shares the records
// out between them.
func (s *Service) record() {
	for s.background.Err() == nil {
		err := s.bus.ConsumeInvocations(s.background, recordBatch, recordWait, s.writeRecords)
		if err != nil && s.background.Err() == nil {
			s.log.Warn("record invocations", "err", err)
			select {
			case <-s.background.Done():
			case <-time.After(time.Second):
			}
		}
	}
}

// writeRecords writes one fetch of records: the servers' first, then the
// hosts' over them. A server records what the caller saw; a host records
// what ran, which is the truth about the invocation when both exist.
func (s *Service) writeRecords(ctx context.Context, recs []bus.Message) error {
	var fromHosts, fromServers []*functionsv1.Invocation
	for _, r := range recs {
		msg := &hostv1.InvocationRecords{}
		if err := proto.Unmarshal(r.Data, msg); err != nil {
			s.log.Warn("invalid invocation records", "subject", r.Subject, "err", err)
			continue
		}
		if r.Subject == bus.InvocationsServerSubject {
			fromServers = append(fromServers, msg.GetInvocations()...)
		} else {
			fromHosts = append(fromHosts, msg.GetInvocations()...)
		}
	}
	for _, batch := range []struct {
		invs     []*functionsv1.Invocation
		override bool
	}{{fromServers, false}, {fromHosts, true}} {
		if len(batch.invs) == 0 {
			continue
		}
		if err := s.writeBatch(ctx, lastByID(batch.invs), batch.override); err != nil {
			return err
		}
	}
	return nil
}

// writeBatch writes invs in one statement. When the database refuses the
// statement on its content, it writes them one at a time, so the record
// at fault is logged and left behind instead of holding every record after
// it on the stream. Any other failure, such as the database being away, is
// returned so the batch is redelivered.
func (s *Service) writeBatch(ctx context.Context, invs []*functionsv1.Invocation, override bool) error {
	err := s.store.InsertInvocations(ctx, s.insertParams(invs, override))
	switch {
	case err == nil:
		return nil
	case !refused(err):
		s.log.Warn("write invocation records", "count", len(invs), "err", err)
		return err
	case len(invs) == 1:
		s.log.Error("invocation record was refused and is dropped", "invocation_id", invs[0].GetId(), "err", err)
		return nil
	}
	s.log.Warn("write invocation records; retrying one at a time", "count", len(invs), "err", err)
	for _, inv := range invs {
		if err := s.writeBatch(ctx, []*functionsv1.Invocation{inv}, override); err != nil {
			return err
		}
	}
	return nil
}

// refused reports whether err is the database rejecting a statement for
// what it says, not for when it was said: a cardinality, data or constraint
// error.
func refused(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	class := pgErr.Code[:2]
	return class == "21" || class == "22" || class == "23"
}

// lastByID keeps the last record of each invocation in invs, in order. A
// statement that upserts one id twice is refused, and a host can publish a
// record twice when it retries.
func lastByID(invs []*functionsv1.Invocation) []*functionsv1.Invocation {
	last := make(map[string]int, len(invs))
	for i, inv := range invs {
		last[inv.GetId()] = i
	}
	if len(last) == len(invs) {
		return invs
	}
	out := make([]*functionsv1.Invocation, 0, len(last))
	for i, inv := range invs {
		if last[inv.GetId()] == i {
			out = append(out, inv)
		}
	}
	return out
}

// insertParams lays invocations out as the columns InsertInvocations takes.
// One that cannot be a row is logged and left out.
func (s *Service) insertParams(invs []*functionsv1.Invocation, override bool) sqlcgen.InsertInvocationsParams {
	p := sqlcgen.InsertInvocationsParams{Override: override}
	for _, inv := range invs {
		status, ok := invocationStatusRow(inv.GetStatus())
		if !ok {
			s.log.Warn("invocation record with no status", "invocation_id", inv.GetId(), "status", inv.GetStatus())
			continue
		}
		var fe string
		if inv.GetError() != nil {
			raw, _ := protojson.Marshal(inv.GetError())
			fe = string(raw)
		}
		p.Ids = append(p.Ids, inv.GetId())
		p.TenantIds = append(p.TenantIds, inv.GetTenantId())
		p.FunctionIds = append(p.FunctionIds, inv.GetFunctionId())
		p.Versions = append(p.Versions, inv.GetVersion())
		p.Statuses = append(p.Statuses, string(status))
		p.StartKinds = append(p.StartKinds, string(startKindRow(inv.GetStartKind()).StartKind))
		p.AcquireUs = append(p.AcquireUs, inv.GetStats().GetAcquireUs())
		p.RunUs = append(p.RunUs, inv.GetStats().GetRunUs())
		p.TotalUs = append(p.TotalUs, inv.GetStats().GetTotalUs())
		p.Errors = append(p.Errors, fe)
		p.PlatformErrors = append(p.PlatformErrors, inv.GetPlatformError())
		p.InputBytes = append(p.InputBytes, inv.GetInputBytes())
		p.OutputBytes = append(p.OutputBytes, inv.GetOutputBytes())
		p.InstanceIds = append(p.InstanceIds, inv.GetInstanceId())
		p.IdempotencyKeys = append(p.IdempotencyKeys, inv.GetIdempotencyKey())
		p.Hosts = append(p.Hosts, inv.GetHost())
		p.Attempts = append(p.Attempts, inv.GetAttempts())
		p.Asyncs = append(p.Asyncs, inv.GetAsync())
		p.CreatedByUserIds = append(p.CreatedByUserIds, inv.GetCreatedByUserId())
		p.CreatedAts = append(p.CreatedAts, millis(inv.GetCreatedAt()))
		p.StartedAts = append(p.StartedAts, millis(inv.GetStartedAt()))
		p.EndedAts = append(p.EndedAts, millis(inv.GetEndedAt()))
	}
	return p
}

func millis(ms int64) pgtype.Timestamptz {
	if ms == 0 {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: time.UnixMilli(ms), Valid: true}
}

// publishRecord publishes an invocation whose outcome this server alone
// knows, over any record the host that ran it published.
func (s *Service) publishRecord(inv *functionsv1.Invocation) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(s.background), recordWait*100)
	defer cancel()
	if err := s.bus.PublishInvocations(ctx, bus.InvocationsServerSubject, &hostv1.InvocationRecords{Invocations: []*functionsv1.Invocation{inv}}); err != nil {
		s.log.Error("publish invocation record", "invocation_id", inv.GetId(), "err", err)
	}
}
