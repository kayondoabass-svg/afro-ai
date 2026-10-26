import { CHATBOT_VERIFICATION_SCHEMA } from "./chatbot-verification-schema";
import { INTEGRATION_PROJECT_SCHEMA } from "./integration-project-schema";
import { EMAIL_DELIVERY_SCHEMA } from "./email-delivery-schema";

interface SchemaClient {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
  release(): void;
}
interface SchemaPool { connect(): Promise<SchemaClient> }

const tables = [
  "integration_project_migrations", "email_projects", "email_project_domains",
  "email_key_state", "chatbot_api_policy", "chatbot_api_credentials",
  "chatbot_site_settings", "chatbot_verified_domains",
  "email_quota_periods", "email_send_requests", "email_provider_events",
];
const triggerNames = [
  "chatbot_new_site_policy_trigger", "chatbot_private_api_new_widget_trigger",
  "email_legacy_key_bridge", "email_legacy_domain_bridge",
];
const triggerTables = [
  "chatbot_widgets", "chatbot_widgets", "email_api_keys", "email_api_domains",
];

async function isReady(client: SchemaClient): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT bool_and(to_regclass(name) IS NOT NULL) AS ready FROM unnest($1::text[]) AS name",
    [tables],
  );
  if (rows[0]?.ready !== true) return false;
  const { rows: metadata } = await client.query(`SELECT
    EXISTS(SELECT 1 FROM integration_project_migrations
      WHERE name='email-project-legacy-import') AS imported,
    (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal
      AND (tgname,tgrelid) IN (
        SELECT name,to_regclass(table_name)
        FROM unnest($1::text[],$2::text[]) AS p(name,table_name)
      )) AS triggers`, [triggerNames, triggerTables]);
  return metadata[0]?.imported === true && metadata[0]?.triggers === triggerNames.length;
}

/** Direct builds/restarts must not bypass the deploy script's additive setup. */
export async function prepareIntegrationSchema(pool: SchemaPool): Promise<void> {
  const client = await pool.connect();
  try {
    // Ready installations need only SELECT access, not runtime DDL privileges.
    if (await isReady(client)) return;
    await client.query(CHATBOT_VERIFICATION_SCHEMA);
    await client.query(INTEGRATION_PROJECT_SCHEMA);
    await client.query(EMAIL_DELIVERY_SCHEMA);
    if (!await isReady(client)) throw new Error("Schema readiness verification failed");
  } catch (error: any) {
    // A failed multi-statement migration may leave this connection in a
    // transaction. Recover that exact connection before returning it to the pool.
    await client.query("ROLLBACK").catch(() => {});
    const code = /^[A-Z0-9]{5}$/.test(error?.code || "") ? error.code : "SETUP_FAILED";
    console.error("[integrations] Required startup setup failed", { code });
    throw new Error("Required integration database setup failed; application is not ready.");
  } finally {
    client.release();
  }
}
