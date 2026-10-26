import type { Pool } from "pg";
export const AUTH_BRANDING_SCHEMA = `
CREATE TABLE IF NOT EXISTS auth_branding_subscriptions (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL CHECK(plan IN ('free','builder','business','scale')),
  source TEXT NOT NULL CHECK(source IN ('payment','override')),
  expires_at TIMESTAMPTZ,
  payment_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_branding_audit (
  id BIGSERIAL PRIMARY KEY, actor_id TEXT NOT NULL, owner_id TEXT NOT NULL,
  project_id TEXT NOT NULL, action TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_branding_audit_owner ON auth_branding_audit(owner_id,created_at);
`;
export async function prepareAuthBrandingSchema(pool: Pick<Pool,"query">) {
  await pool.query(AUTH_BRANDING_SCHEMA);
}
