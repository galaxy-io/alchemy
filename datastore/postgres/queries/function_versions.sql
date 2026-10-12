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

-- name: ListFunctionVersions :many
SELECT * FROM function_versions
WHERE function_id = $1
ORDER BY version DESC
LIMIT sqlc.arg('row_limit') OFFSET sqlc.arg('row_offset');

-- name: CountFunctionVersions :one
SELECT count(*) FROM function_versions WHERE function_id = $1;

-- name: ListBuildingFunctionVersions :many
SELECT * FROM function_versions WHERE status = 'building' ORDER BY created_at;

-- name: StartFunctionVersionBuild :exec
UPDATE function_versions SET build_started_at = now() WHERE id = $1;

-- name: FinishFunctionVersionBuild :one
UPDATE function_versions
SET status = $2, status_message = $3, image_digest = $4, rootfs_bytes = $5, build_log = $6,
    artifact_id = $7, artifact = $8, build_ended_at = now()
WHERE id = $1
RETURNING *;

-- name: GetFunctionVersionByArtifact :one
SELECT * FROM function_versions WHERE tenant_id = $1 AND artifact_id = $2 ORDER BY version DESC LIMIT 1;
