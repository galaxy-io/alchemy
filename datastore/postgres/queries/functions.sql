-- name: CreateFunction :one
INSERT INTO functions (tenant_id, name, description, created_by_user_id, updated_by_user_id)
VALUES ($1, $2, $3, $4, $4)
RETURNING *;

-- name: GetFunction :one
SELECT * FROM functions WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted;

-- name: UpdateFunction :one
UPDATE functions
SET name = $3, description = $4, updated_by_user_id = $5, updated_at = now()
WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted
RETURNING *;

-- name: TouchFunction :exec
UPDATE functions SET updated_at = now() WHERE id = $1;

-- name: DeleteFunction :execrows
-- Flags the function and moves its name out of the way, so the name is
-- free again while the row keeps its versions and invocations.
UPDATE functions
SET is_deleted = true, deleted_at = now(), deleted_by_user_id = $3, updated_at = now(),
    name = name || '__deleted__' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted;

-- name: ListFunctions :many
SELECT * FROM functions
WHERE tenant_id = $1 AND NOT is_deleted AND (sqlc.arg('search')::text = '' OR name ILIKE '%' || sqlc.arg('search') || '%')
ORDER BY created_at, id
LIMIT sqlc.arg('row_limit') OFFSET sqlc.arg('row_offset');

-- name: CountFunctions :one
SELECT count(*) FROM functions
WHERE tenant_id = $1 AND NOT is_deleted AND (sqlc.arg('search')::text = '' OR name ILIKE '%' || sqlc.arg('search') || '%');
