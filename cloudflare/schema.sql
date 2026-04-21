-- Afro AI auth schema (Cloudflare D1)
-- Run with: npx wrangler d1 execute afro-ai-auth --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT,                       -- nullable for OAuth-only users
  first_name        TEXT,
  last_name         TEXT,
  profile_image_url TEXT,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  plan              TEXT NOT NULL DEFAULT 'free',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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
