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
SELECT DISTINCT ON (function_id) * FROM function_versions
WHERE status = 'ready'
ORDER BY function_id, version DESC;

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

-- name: FinishFunctionVersionBuild :one
UPDATE function_versions
SET status = $3, status_message = $4, image_digest = $5, rootfs_bytes = $6, build_log = $7,
    artifact_id = $8, artifact = $9, build_ended_at = now()
WHERE id = $1 AND status = 'building' AND build_started_at = $2
RETURNING *;

-- name: GetFunctionVersionByArtifact :one
SELECT * FROM function_versions WHERE tenant_id = $1 AND artifact_id = $2 ORDER BY version DESC LIMIT 1;
