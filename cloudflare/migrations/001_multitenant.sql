-- 001: Multi-tenant migration for Afro Auth product.
--
-- D1 wraps each --file execution in an implicit transaction and disallows
-- BEGIN/COMMIT/PRAGMA, so we just list bare statements here. If any
-- statement fails the whole file is rolled back.

-- 1. tenants
CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  owner_user_id   TEXT,
  plan            TEXT NOT NULL DEFAULT 'free',
  allowed_origins TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_user_id);
INSERT OR IGNORE INTO tenants (id, slug, name, owner_user_id, plan, created_at, updated_at)
VALUES ('platform', 'platform', 'Afro AI (platform)', NULL, 'scale', 0, 0);

-- 2. api_keys
CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  public_key      TEXT UNIQUE NOT NULL,
  secret_hash     TEXT NOT NULL,
  secret_preview  TEXT NOT NULL,
  label           TEXT,
  last_used_at    INTEGER,
  revoked_at      INTEGER,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_public ON api_keys(public_key);

-- 3. Rebuild users table to add tenant_id and replace UNIQUE(email) with
--    UNIQUE(tenant_id, email).
CREATE TABLE users_new (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL DEFAULT 'platform',
  email             TEXT NOT NULL,
  password_hash     TEXT,
  first_name        TEXT,
  last_name         TEXT,
  profile_image_url TEXT,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  plan              TEXT NOT NULL DEFAULT 'free',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
INSERT INTO users_new
  (id, tenant_id, email, password_hash, first_name, last_name,
   profile_image_url, email_verified, plan, created_at, updated_at)
SELECT id, 'platform', email, password_hash, first_name, last_name,
       profile_image_url, email_verified, plan, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_users_tenant_created ON users(tenant_id, created_at);
CREATE INDEX idx_users_email ON users(email);

-- 4. usage tracking
CREATE TABLE IF NOT EXISTS tenant_usage (
  tenant_id  TEXT NOT NULL,
  period     TEXT NOT NULL,
  mau_count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, period),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_user_activity (
  tenant_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  period     TEXT NOT NULL,
  seen_at    INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, user_id, period)
);
CREATE INDEX IF NOT EXISTS idx_tenant_activity_period ON tenant_user_activity(period);
