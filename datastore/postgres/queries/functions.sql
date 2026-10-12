-- name: CreateFunction :one
INSERT INTO functions (tenant_id, name, description, created_by_user_id, updated_by_user_id)
VALUES ($1, $2, $3, $4, $4)
RETURNING *;

-- name: GetFunction :one
SELECT * FROM functions WHERE tenant_id = $1 AND id = $2;

-- name: UpdateFunction :one
UPDATE functions
SET name = $3, description = $4, updated_by_user_id = $5, updated_at = now()
WHERE tenant_id = $1 AND id = $2
RETURNING *;

-- name: TouchFunction :exec
UPDATE functions SET updated_at = now() WHERE id = $1;

-- name: DeleteFunction :execrows
DELETE FROM functions WHERE tenant_id = $1 AND id = $2;

-- name: ListFunctions :many
SELECT * FROM functions
WHERE tenant_id = $1 AND (sqlc.arg('search')::text = '' OR name ILIKE '%' || sqlc.arg('search') || '%')
ORDER BY created_at, id
LIMIT sqlc.arg('row_limit') OFFSET sqlc.arg('row_offset');

-- name: CountFunctions :one
SELECT count(*) FROM functions
WHERE tenant_id = $1 AND (sqlc.arg('search')::text = '' OR name ILIKE '%' || sqlc.arg('search') || '%');
