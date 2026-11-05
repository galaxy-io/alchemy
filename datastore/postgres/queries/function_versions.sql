-- name: CreateFunctionVersion :one
INSERT INTO function_versions (tenant_id, function_id, version, spec, created_by_user_id)
VALUES (
  $1, $2,
  (SELECT coalesce(max(version), 0) + 1 FROM function_versions WHERE function_id = $2),
  $3, $4
)
RETURNING *;

-- name: GetFunctionVersion :one
SELECT * FROM function_versions WHERE function_id = $1 AND version = $2;

-- name: GetCurrentFunctionVersion :one
SELECT * FROM function_versions
WHERE function_id = $1 AND status = 'ready'
ORDER BY version DESC
LIMIT 1;

-- name: ListCurrentFunctionVersions :many
-- The current version of every live function: what hosts should serve.
SELECT DISTINCT ON (v.function_id) v.* FROM function_versions v
JOIN functions f ON f.id = v.function_id AND NOT f.is_deleted
WHERE v.status = 'ready'
ORDER BY v.function_id, v.version DESC;

-- name: ListFunctionVersions :many
SELECT * FROM function_versions
WHERE function_id = $1
ORDER BY version DESC
LIMIT sqlc.arg('row_limit') OFFSET sqlc.arg('row_offset');

-- name: CountFunctionVersions :one
SELECT count(*) FROM function_versions WHERE function_id = $1;

-- A server claims a build by stamping build_started_at, and only the claim
-- it holds can finish it.

-- name: ClaimFunctionVersionBuild :one
UPDATE function_versions SET build_started_at = now()
WHERE id = $1 AND status = 'building' AND build_started_at IS NULL
RETURNING *;

-- name: ClaimStaleFunctionVersionBuilds :many
-- Takes over builds no server is running: unclaimed, or claimed longer ago
-- than a build may run. The new build_started_at fences the old builder's
-- result.
UPDATE function_versions v SET build_started_at = now()
FROM functions f
WHERE f.id = v.function_id AND NOT f.is_deleted
  AND v.status = 'building'
  AND (v.build_started_at IS NULL OR v.build_started_at < now() - sqlc.arg('stale')::interval)
RETURNING v.*;

-- name: ReleaseFunctionVersionBuild :exec
-- Gives up a claim, for another server to take the build, unless the build
-- was taken over since.
UPDATE function_versions SET build_started_at = NULL
WHERE id = $1 AND status = 'building' AND build_started_at = $2;

-- name: FinishFunctionVersionBuild :one
UPDATE function_versions
SET status = $3, status_message = $4, image_digest = $5, rootfs_bytes = $6, build_log = $7,
    artifact_id = $8, artifact = $9, build_ended_at = now()
WHERE id = $1 AND status = 'building' AND build_started_at = $2
RETURNING *;
