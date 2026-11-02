-- name: PutSecret :exec
INSERT INTO secrets (tenant_id, ref, ciphertext, nonce, key_id, metadata)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (tenant_id, ref) DO UPDATE SET
  ciphertext = EXCLUDED.ciphertext,
  nonce = EXCLUDED.nonce,
  key_id = EXCLUDED.key_id,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- name: ReplaceSecret :execrows
UPDATE secrets
SET ciphertext = $3, nonce = $4, key_id = $5, metadata = $6, updated_at = now()
WHERE tenant_id = $1 AND ref = $2;

-- name: GetSecret :one
SELECT * FROM secrets WHERE tenant_id = $1 AND ref = $2;

-- name: DeleteSecret :exec
DELETE FROM secrets WHERE tenant_id = $1 AND ref = $2;
