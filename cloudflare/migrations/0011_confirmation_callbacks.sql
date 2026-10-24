-- Additive, opt-in configuration. Existing keys, users and sessions unchanged.
CREATE TABLE IF NOT EXISTS tenant_confirmation_config (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  callback_url TEXT,
  updated_at INTEGER NOT NULL
);
