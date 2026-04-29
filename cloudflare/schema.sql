-- Afro AI auth schema (Cloudflare D1)
-- Run with: npx wrangler d1 execute afro-ai-auth --remote --file=./schema.sql
--
-- The same database backs TWO things:
--   1. Login on afroaigroup.com itself (tenant_id = 'platform').
--   2. The "Afro Auth" product — multi-tenant Login-as-a-Service for our
--      customers (each customer is a row in `tenants` with a unique slug;
--      their end-users live in `users` scoped by tenant_id).

CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,             -- 'tnt_<random>' (or 'platform')
  slug            TEXT UNIQUE NOT NULL,         -- e.g. 'myshop' (used in /cf-auth/t/:slug/*)
  name            TEXT NOT NULL,                -- human-readable, e.g. "MyShop Login"
  owner_user_id   TEXT,                         -- platform user that owns this tenant
  plan            TEXT NOT NULL DEFAULT 'free', -- free | builder | business | scale
  allowed_origins TEXT,                         -- JSON array of origins for CORS, NULL = none
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_user_id);

-- Seed the platform tenant for afroaigroup.com itself. INSERT-OR-IGNORE
-- makes this safe to re-run; the owner_user_id stays NULL forever for the
-- platform tenant since "afroaigroup.com" doesn't have a separate owner.
INSERT OR IGNORE INTO tenants (id, slug, name, owner_user_id, plan, created_at, updated_at)
VALUES ('platform', 'platform', 'Afro AI (platform)', NULL, 'scale', 0, 0);

CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY,             -- 'key_<random>'
  tenant_id       TEXT NOT NULL,
  public_key      TEXT UNIQUE NOT NULL,         -- 'pub_live_...' safe to ship to browsers
  secret_hash     TEXT NOT NULL,                -- pbkdf2 hash of 'sk_live_...' (raw never stored)
  secret_preview  TEXT NOT NULL,                -- first 12 chars of secret for UI ("sk_live_abc…")
  label           TEXT,                         -- optional, e.g. "production"
  last_used_at    INTEGER,
  revoked_at      INTEGER,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_public ON api_keys(public_key);

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL DEFAULT 'platform',
  email             TEXT NOT NULL,
  password_hash     TEXT,                       -- nullable for OAuth-only users
  first_name        TEXT,
  last_name         TEXT,
  profile_image_url TEXT,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  plan              TEXT NOT NULL DEFAULT 'free',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Email is unique PER TENANT (a single email can exist as a user inside many
-- different customer apps — that's expected for B2C login).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_users_tenant_created ON users(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  provider         TEXT NOT NULL,               -- 'google' | 'github' | 'tiktok'
  provider_user_id TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  UNIQUE(provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token_hash  TEXT UNIQUE NOT NULL,             -- SHA-256 of the raw token
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);

-- Per-IP and per-email rate limiting for /cf-auth/login, /cf-auth/signup,
-- and /cf-auth/forgot-password. The Worker writes one row per throttle key
-- (e.g. "login:ip:1.2.3.4" or "login:email:foo@bar.com") and locks the key
-- for a cool-off period after too many failures inside the rolling window.
CREATE TABLE IF NOT EXISTS auth_throttle (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  window_start  INTEGER NOT NULL,
  locked_until  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auth_throttle_locked ON auth_throttle(locked_until);
CREATE INDEX IF NOT EXISTS idx_auth_throttle_window_start ON auth_throttle(window_start);

-- Monthly Active Users counter per tenant. One row per (tenant, year-month).
-- Incremented (best effort, race-tolerant) on each successful login or token
-- verify. Used to enforce plan limits and show usage in the dashboard.
CREATE TABLE IF NOT EXISTS tenant_usage (
  tenant_id  TEXT NOT NULL,
  period     TEXT NOT NULL,                     -- 'YYYY-MM'
  mau_count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, period),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Track which users were active in which period so MAU is unique per user.
-- Pruned by the existing hourly cron once it's older than ~40 days.
CREATE TABLE IF NOT EXISTS tenant_user_activity (
  tenant_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  period     TEXT NOT NULL,                     -- 'YYYY-MM'
  seen_at    INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, user_id, period)
);

CREATE INDEX IF NOT EXISTS idx_tenant_activity_period ON tenant_user_activity(period);
