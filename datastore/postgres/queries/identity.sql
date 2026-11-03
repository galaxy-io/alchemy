-- name: ResolveTenant :one
-- A provider's organization becomes a tenant on first sight; later sightings
-- keep its name current when the provider has one.
INSERT INTO tenants (external_id, name)
VALUES (@external_id, NULLIF(@name::text, ''))
ON CONFLICT (external_id) DO UPDATE SET
  name = COALESCE(EXCLUDED.name, tenants.name),
  updated_at = now()
RETURNING id;

-- name: EnsureUser :one
-- A provider's user becomes a user of its tenant on first sight.
INSERT INTO users (tenant_id, external_id)
VALUES (@tenant_id, @external_id)
ON CONFLICT (tenant_id, external_id) DO UPDATE SET external_id = EXCLUDED.external_id
RETURNING id;
