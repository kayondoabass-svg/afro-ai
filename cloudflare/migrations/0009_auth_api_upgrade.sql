-- Optional integration preference only. No user, key or session rows are moved.
CREATE TABLE IF NOT EXISTS tenant_api_adoptions (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  selected_contract TEXT NOT NULL CHECK(selected_contract IN ('legacy','v1')),
  selected_at INTEGER NOT NULL
);
