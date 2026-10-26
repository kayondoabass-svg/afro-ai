CREATE TABLE IF NOT EXISTS auth_branding_entitlements (
  owner_user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  source TEXT NOT NULL,
  expires_at INTEGER,
  payment_id INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tenant_email_branding (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  settings TEXT NOT NULL DEFAULT '{}',
  sender_domain TEXT,
  provider_domain_id TEXT,
  updated_at INTEGER NOT NULL
);
