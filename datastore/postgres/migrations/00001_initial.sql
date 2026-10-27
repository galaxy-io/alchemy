-- +goose Up

-- Identity. The nil tenant is the built-in tenant used while callers carry
-- no identity.
CREATE TABLE tenants (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT,
  external_id        TEXT        UNIQUE,
  created_by_user_id UUID,
  updated_by_user_id UUID,
  deleted_by_user_id UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants (id),
  external_id        TEXT        NOT NULL,
  created_by_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
  updated_by_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
  deleted_by_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

ALTER TABLE tenants
  ADD CONSTRAINT tenants_created_by_user_fkey FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT tenants_updated_by_user_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT tenants_deleted_by_user_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES users (id) ON DELETE SET NULL;

INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000000', 'default');

CREATE TABLE functions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants (id),
  name               TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  -- A deleted function stays, flagged and renamed out of the way, so its
  -- versions and invocations keep their history.
  is_deleted         BOOLEAN     NOT NULL DEFAULT false,
  deleted_at         TIMESTAMPTZ,
  deleted_by_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
  created_by_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
  updated_by_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TYPE function_version_status AS ENUM ('building', 'ready', 'failed');

-- spec is the FunctionSpec as proto JSON. The contract lives inside it; it is
-- immutable once the row exists.
CREATE TABLE function_versions (
  id                 UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID                    NOT NULL REFERENCES tenants (id),
  function_id        UUID                    NOT NULL REFERENCES functions (id) ON DELETE CASCADE,
  version            BIGINT                  NOT NULL,
  spec               JSONB                   NOT NULL,
  status             function_version_status NOT NULL DEFAULT 'building',
  status_message     TEXT                    NOT NULL DEFAULT '',
  image_digest       TEXT                    NOT NULL DEFAULT '',
  rootfs_bytes       BIGINT                  NOT NULL DEFAULT 0,
  -- artifact is what the build produced (host.v1.Artifact as JSON): the
  -- server sends it to a host verbatim with every invoke. artifact_id keys
  -- instances and the invoke subject.
  artifact_id        TEXT                    NOT NULL DEFAULT '',
  artifact           JSONB,
  build_log          TEXT                    NOT NULL DEFAULT '',
  build_started_at   TIMESTAMPTZ,
  build_ended_at     TIMESTAMPTZ,
  created_by_user_id UUID                    REFERENCES users (id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ             NOT NULL DEFAULT now(),
  UNIQUE (function_id, version)
);

-- The current version of a function is its newest ready one.
CREATE INDEX function_versions_ready_idx ON function_versions (function_id, version DESC) WHERE status = 'ready';

CREATE TYPE invocation_status AS ENUM ('pending', 'starting', 'running', 'succeeded', 'failed', 'errored', 'canceled', 'rejected');
CREATE TYPE start_kind AS ENUM ('cold_boot', 'snapshot_restore', 'warm');

-- One row per ended invocation, written once, in batches, from the records
-- hosts and servers publish; nothing is written while an invocation runs.
-- error is a FunctionError as proto JSON.
CREATE TABLE invocations (
  id                 UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID              NOT NULL REFERENCES tenants (id),
  function_id        UUID              NOT NULL REFERENCES functions (id) ON DELETE CASCADE,
  version            BIGINT            NOT NULL,
  status             invocation_status NOT NULL DEFAULT 'pending',
  start_kind         start_kind,
  acquire_us         BIGINT            NOT NULL DEFAULT 0,
  run_us             BIGINT            NOT NULL DEFAULT 0,
  total_us           BIGINT            NOT NULL DEFAULT 0,
  error              JSONB,
  platform_error     TEXT              NOT NULL DEFAULT '',
  input_bytes        BIGINT            NOT NULL DEFAULT 0,
  output_bytes       BIGINT            NOT NULL DEFAULT 0,
  instance_id        TEXT              NOT NULL DEFAULT '',
  idempotency_key    TEXT              NOT NULL DEFAULT '',
  host               TEXT              NOT NULL DEFAULT '',
  created_by_user_id UUID              REFERENCES users (id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ       NOT NULL DEFAULT now(),
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ
);

CREATE INDEX invocations_function_created_idx ON invocations (function_id, created_at DESC);
CREATE INDEX invocations_tenant_created_idx ON invocations (tenant_id, created_at DESC);

-- A caller's idempotency key and the invocation it started. Claimed by a
-- server before the invocation runs, so two servers never run the same key
-- twice, and marked with the host before the invocation is sent to it, so
-- a claim with no host behind it is known never to have run. Rows expire
-- after the server's idempotency window.
CREATE TABLE idempotency_keys (
  tenant_id     UUID        NOT NULL REFERENCES tenants (id),
  function_id   UUID        NOT NULL REFERENCES functions (id) ON DELETE CASCADE,
  key           TEXT        NOT NULL,
  invocation_id UUID        NOT NULL,
  server        TEXT        NOT NULL,
  host          TEXT        NOT NULL DEFAULT '',
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, function_id, key)
);

CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);

-- +goose Down
DROP TABLE idempotency_keys;
DROP TABLE invocations;
DROP TYPE start_kind;
DROP TYPE invocation_status;
DROP TABLE function_versions;
DROP TYPE function_version_status;
DROP TABLE functions;
ALTER TABLE tenants
  DROP CONSTRAINT tenants_created_by_user_fkey,
  DROP CONSTRAINT tenants_updated_by_user_fkey,
  DROP CONSTRAINT tenants_deleted_by_user_fkey;
DROP TABLE users;
DROP TABLE tenants;
