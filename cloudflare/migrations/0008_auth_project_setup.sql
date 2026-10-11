-- Existing integrations keep working. Only new projects require DNS activation.
ALTER TABLE tenants ADD COLUMN setup_required INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS tenant_domains (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  challenge TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  last_checked_at INTEGER,
  UNIQUE(tenant_id, domain)
);
CREATE INDEX IF NOT EXISTS tenant_domains_owner ON tenant_domains(tenant_id, verified_at);
