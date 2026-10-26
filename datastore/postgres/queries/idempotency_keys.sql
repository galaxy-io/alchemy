-- name: ClaimIdempotencyKey :one
-- Claims key for invocation_id on behalf of server. An expired claim is
-- taken over; a live one is left alone, and no row comes back.
INSERT INTO idempotency_keys (tenant_id, function_id, key, invocation_id, server)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (tenant_id, function_id, key) DO UPDATE
  SET invocation_id = EXCLUDED.invocation_id, server = EXCLUDED.server, host = '', sent_at = NULL, created_at = now()
  WHERE idempotency_keys.created_at < now() - sqlc.arg('window')::interval
RETURNING invocation_id;

-- name: GetIdempotencyKey :one
SELECT invocation_id, server, host, sent_at, created_at FROM idempotency_keys
WHERE tenant_id = $1 AND function_id = $2 AND key = $3;

-- name: MarkIdempotencyKeySent :execrows
-- Records the host invocation_id is about to be sent to. No row means the
-- claim moved on, and the sender must not send.
UPDATE idempotency_keys SET host = sqlc.arg('host'), sent_at = now()
WHERE tenant_id = $1 AND function_id = $2 AND key = $3 AND invocation_id = $4;

-- name: TakeOverIdempotencyKey :execrows
-- Moves key from an invocation that never ran to a new one on server. The
-- proof is checked in the same statement: either the claim was never marked
-- with a host, or its owner recorded that no host ran it (a host's own
-- record always names the host).
UPDATE idempotency_keys k
SET invocation_id = sqlc.arg('new_invocation_id'), server = sqlc.arg('server'), host = '', sent_at = NULL, created_at = now()
WHERE k.tenant_id = $1 AND k.function_id = $2 AND k.key = $3 AND k.invocation_id = sqlc.arg('old_invocation_id')
  AND (k.host = '' OR EXISTS (
    SELECT 1 FROM invocations i
    WHERE i.id = sqlc.arg('old_invocation_id') AND i.host = ''
      AND i.status IN ('errored'::invocation_status, 'canceled'::invocation_status)));

-- name: DeleteExpiredIdempotencyKeys :execrows
DELETE FROM idempotency_keys WHERE created_at < now() - sqlc.arg('window')::interval;
