-- name: GetInvocation :one
SELECT * FROM invocations WHERE tenant_id = $1 AND id = $2;

-- name: InsertInvocations :exec
-- One row per element of the arrays, which all have the same length. A
-- record of an invocation already written changes it only when override is
-- set: a host's record over a server's, since the host knows what ran.
WITH r AS (
  SELECT
    unnest(sqlc.arg('ids')::uuid[]) AS id,
    unnest(sqlc.arg('tenant_ids')::uuid[]) AS tenant_id,
    unnest(sqlc.arg('function_ids')::uuid[]) AS function_id,
    unnest(sqlc.arg('versions')::bigint[]) AS version,
    unnest(sqlc.arg('statuses')::text[]) AS status,
    unnest(sqlc.arg('start_kinds')::text[]) AS start_kind,
    unnest(sqlc.arg('acquire_us')::bigint[]) AS acquire_us,
    unnest(sqlc.arg('run_us')::bigint[]) AS run_us,
    unnest(sqlc.arg('total_us')::bigint[]) AS total_us,
    unnest(sqlc.arg('errors')::text[]) AS error,
    unnest(sqlc.arg('platform_errors')::text[]) AS platform_error,
    unnest(sqlc.arg('input_bytes')::bigint[]) AS input_bytes,
    unnest(sqlc.arg('output_bytes')::bigint[]) AS output_bytes,
    unnest(sqlc.arg('instance_ids')::text[]) AS instance_id,
    unnest(sqlc.arg('idempotency_keys')::text[]) AS idempotency_key,
    unnest(sqlc.arg('hosts')::text[]) AS host,
    unnest(sqlc.arg('created_by_user_ids')::text[]) AS created_by_user_id,
    unnest(sqlc.arg('created_ats')::timestamptz[]) AS created_at,
    unnest(sqlc.arg('started_ats')::timestamptz[]) AS started_at,
    unnest(sqlc.arg('ended_ats')::timestamptz[]) AS ended_at
)
INSERT INTO invocations (id, tenant_id, function_id, version, status, start_kind, acquire_us, run_us, total_us,
                         error, platform_error, input_bytes, output_bytes, instance_id, idempotency_key, host, created_by_user_id,
                         created_at, started_at, ended_at)
SELECT id, tenant_id, function_id, version, status::invocation_status, nullif(start_kind, '')::start_kind,
       acquire_us, run_us, total_us, nullif(error, '')::jsonb, platform_error, input_bytes, output_bytes, instance_id, idempotency_key, host,
       nullif(created_by_user_id, '')::uuid, created_at, started_at, ended_at
FROM r
ON CONFLICT (id) DO UPDATE SET
  status = excluded.status, start_kind = excluded.start_kind, acquire_us = excluded.acquire_us,
  run_us = excluded.run_us, total_us = excluded.total_us, error = excluded.error,
  platform_error = excluded.platform_error, output_bytes = excluded.output_bytes,
  instance_id = excluded.instance_id, host = excluded.host, started_at = excluded.started_at, ended_at = excluded.ended_at
WHERE sqlc.arg('override')::boolean;

-- name: ListInvocations :many
SELECT * FROM invocations
WHERE tenant_id = $1
  AND (cardinality(sqlc.arg('function_ids')::uuid[]) = 0 OR function_id = ANY(sqlc.arg('function_ids')::uuid[]))
  AND (cardinality(sqlc.arg('statuses')::text[]) = 0 OR status::text = ANY(sqlc.arg('statuses')::text[]))
  AND (cardinality(sqlc.arg('start_kinds')::text[]) = 0 OR start_kind::text = ANY(sqlc.arg('start_kinds')::text[]))
  AND (sqlc.narg('since')::timestamptz IS NULL OR created_at >= sqlc.narg('since'))
  AND (sqlc.narg('until')::timestamptz IS NULL OR created_at < sqlc.narg('until'))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('row_limit') OFFSET sqlc.arg('row_offset');

-- name: CountInvocations :one
SELECT count(*) FROM invocations
WHERE tenant_id = $1
  AND (cardinality(sqlc.arg('function_ids')::uuid[]) = 0 OR function_id = ANY(sqlc.arg('function_ids')::uuid[]))
  AND (cardinality(sqlc.arg('statuses')::text[]) = 0 OR status::text = ANY(sqlc.arg('statuses')::text[]))
  AND (cardinality(sqlc.arg('start_kinds')::text[]) = 0 OR start_kind::text = ANY(sqlc.arg('start_kinds')::text[]))
  AND (sqlc.narg('since')::timestamptz IS NULL OR created_at >= sqlc.narg('since'))
  AND (sqlc.narg('until')::timestamptz IS NULL OR created_at < sqlc.narg('until'));
