-- name: CreateInvocation :one
INSERT INTO invocations (tenant_id, function_id, version, input_bytes, created_by_user_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetInvocation :one
SELECT * FROM invocations WHERE tenant_id = $1 AND id = $2;

-- name: SetInvocationStarting :one
UPDATE invocations SET status = 'starting' WHERE id = $1 RETURNING *;

-- name: SetInvocationRunning :one
UPDATE invocations
SET status = 'running', start_kind = $2, instance_id = $3, acquire_us = $4, started_at = now()
WHERE id = $1
RETURNING *;

-- name: FinishInvocation :one
UPDATE invocations
SET status = $2, run_us = $3, total_us = $4, error = $5, platform_error = $6,
    output_bytes = $7, log_tail = $8, ended_at = now()
WHERE id = $1
RETURNING *;

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

-- name: ListActiveInvocations :many
SELECT * FROM invocations
WHERE tenant_id = $1
  AND (sqlc.narg('function_id')::uuid IS NULL OR function_id = sqlc.narg('function_id'))
  AND status IN ('pending', 'starting', 'running')
ORDER BY created_at;

-- name: CancelStaleInvocations :execrows
UPDATE invocations
SET status = 'canceled', platform_error = 'server restarted', ended_at = now()
WHERE status IN ('pending', 'starting', 'running');
