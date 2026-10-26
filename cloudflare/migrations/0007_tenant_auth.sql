CREATE TABLE IF NOT EXISTS tenant_sessions (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS tenant_sessions_owner ON tenant_sessions(tenant_id,user_id);
CREATE TABLE IF NOT EXISTS tenant_auth_tokens (
  hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
  purpose TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER,
  context TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tenant_auth_tokens_owner ON tenant_auth_tokens(tenant_id,user_id,purpose,created_at);
CREATE TABLE IF NOT EXISTS tenant_oauth_accounts (
  tenant_id TEXT NOT NULL, provider TEXT NOT NULL, provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL, PRIMARY KEY(tenant_id,provider,provider_user_id)
);
INSERT OR IGNORE INTO tenant_oauth_accounts
  SELECT u.tenant_id,o.provider,o.provider_user_id,o.user_id
  FROM oauth_accounts o JOIN users u ON u.id=o.user_id WHERE u.tenant_id!='platform';
-- Tenant identities now live in their scoped table. Remove only links proven
-- copied, so the legacy global uniqueness constraint cannot block platform login.
DELETE FROM oauth_accounts WHERE EXISTS (
  SELECT 1 FROM users u JOIN tenant_oauth_accounts t
    ON t.tenant_id=u.tenant_id AND t.user_id=u.id
  WHERE u.id=oauth_accounts.user_id AND u.tenant_id!='platform'
    AND t.provider=oauth_accounts.provider AND t.provider_user_id=oauth_accounts.provider_user_id
);