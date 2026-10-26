import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db";
import { isFounderEmail, presentEmailApiKey } from "./founder-access";

export function integrationError(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export function integrationId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) integrationError(400, "Invalid resource ID");
  return id;
}
export function camelRow(row: any): any {
  return Object.fromEntries(Object.entries(row).map(([k,v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
}
export async function ownedEmailProject(userId: string, id: unknown) {
  const { rows } = await pool.query("SELECT * FROM email_projects WHERE id=$1 AND user_id=$2", [integrationId(id), userId]);
  if (!rows[0]) integrationError(404, "Email project not found");
  return camelRow(rows[0]);
}
export async function legacyEmailProject(userId: string) {
  const { rows } = await pool.query(`INSERT INTO email_projects(user_id,name,legacy)
    VALUES($1,'Existing email setup',true)
    ON CONFLICT(user_id) WHERE legacy DO UPDATE SET user_id=excluded.user_id RETURNING *, (xmax=0) AS newly_created`, [userId]);
  if (rows[0].newly_created) await pool.query(`INSERT INTO email_project_domains(project_id,domain_id)
    SELECT $1,id FROM email_api_domains WHERE user_id=$2 ON CONFLICT(project_id,domain_id) DO NOTHING`,[rows[0].id,userId]);
  return camelRow(rows[0]);
}
export async function storeProjectEmailDomain(userId:string, projectId:number, domain:any) {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const project=await client.query("SELECT id FROM email_projects WHERE id=$1 AND user_id=$2 FOR UPDATE",[projectId,userId]);
    if(!project.rowCount) integrationError(404,"Email project not found");
    await client.query("SELECT set_config('afro.managed_email_insert','yes',true)");
    const {rows:[row]}=await client.query(`INSERT INTO email_api_domains
      (user_id,domain,status,dkim_token,spf_record,dmarc_record,provider,resend_domain_id,verified_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [userId,domain.domain,domain.status,domain.dkimToken,domain.spfRecord,domain.dmarcRecord,
        domain.provider,domain.resendDomainId || null,domain.status==="verified"?new Date():null]);
    await client.query(`INSERT INTO email_project_domains(project_id,domain_id) VALUES($1,$2)
      ON CONFLICT(project_id,domain_id) DO NOTHING`,[projectId,row.id]);
    await client.query(`INSERT INTO email_project_domains(project_id,domain_id)
      SELECT id,$1 FROM email_projects WHERE user_id=$2 AND legacy ON CONFLICT(project_id,domain_id) DO NOTHING`,[row.id,userId]);
    await client.query("COMMIT");
    return camelRow(row);
  } catch(e) {await client.query("ROLLBACK");throw e;}
  finally {client.release();}
}
export async function linkEmailProjectDomain(userId: string, projectId: number, domainId: number) {
  await ownedEmailProject(userId, projectId);
  const { rowCount } = await pool.query(`INSERT INTO email_project_domains(project_id,domain_id)
    SELECT $1,id FROM email_api_domains WHERE id=$2 AND user_id=$3
    ON CONFLICT(project_id,domain_id) DO UPDATE SET domain_id=excluded.domain_id`,
    [projectId, domainId, userId]);
  if (!rowCount) integrationError(404, "Sending domain not found");
}
export async function emailKeyAccess(keyId: number) {
  const { rows } = await pool.query(`SELECT s.*, k.user_id, COALESCE(m.used,0) AS used,
    q.monthly_limit AS quota_limit FROM email_key_state s
    JOIN email_api_keys k ON k.id=s.key_id
    JOIN email_api_keys q ON q.id=s.quota_key_id AND q.user_id=k.user_id
    JOIN email_projects p ON p.id=s.project_id AND p.user_id=k.user_id
    LEFT JOIN email_quota_periods m ON m.quota_key_id=q.id AND m.period=date_trunc('month',now() AT TIME ZONE 'UTC')::date
    WHERE s.key_id=$1`, [keyId]);
  if (!rows[0]) integrationError(503, "Email project setup is not ready");
  if (rows[0].revoked_at) integrationError(401, "API key has been revoked");
  return camelRow(rows[0]);
}
export async function emailProjectAllowsDomain(projectId: number, userId: string, domainId: number) {
  const result = await pool.query(`SELECT 1 FROM email_project_domains a
    JOIN email_projects p ON p.id=a.project_id AND p.user_id=$2
    JOIN email_api_domains d ON d.id=a.domain_id AND d.user_id=$2 AND d.status='verified'
    WHERE a.project_id=$1 AND a.domain_id=$3`, [projectId,userId,domainId]);
  return Boolean(result.rowCount);
}
export async function emailProjectDetail(userId: string, projectId: unknown, ownerEmail: unknown) {
  const project = await ownedEmailProject(userId, projectId);
  const [keys, domains, logs] = await Promise.all([
    pool.query(`SELECT k.*,s.project_id,s.quota_key_id,s.replaces_key_id,s.revoked_at,
      COALESCE(m.used,0) AS quota_used,q.monthly_limit AS quota_limit
      FROM email_api_keys k JOIN email_key_state s ON s.key_id=k.id
      JOIN email_api_keys q ON q.id=s.quota_key_id AND q.user_id=k.user_id
      LEFT JOIN email_quota_periods m ON m.quota_key_id=q.id AND m.period=date_trunc('month',now() AT TIME ZONE 'UTC')::date
      WHERE s.project_id=$1 AND k.user_id=$2 ORDER BY k.created_at DESC`, [project.id,userId]),
    pool.query(`SELECT d.* FROM email_api_domains d JOIN email_project_domains a ON a.domain_id=d.id
      WHERE a.project_id=$1 AND d.user_id=$2 ORDER BY d.created_at DESC`, [project.id,userId]),
    pool.query(`SELECT l.* FROM email_api_logs l JOIN email_key_state s ON s.key_id=l.api_key_id
      WHERE s.project_id=$1 AND l.user_id=$2 ORDER BY l.sent_at DESC LIMIT 100`, [project.id,userId]),
  ]);
  const { rows: [counts] } = await pool.query(`SELECT count(*) FILTER(WHERE l.status IN ('sent','delivered'))::int AS total_sent,
    count(*) FILTER(WHERE l.status IN ('failed','bounced','complained','uncertain'))::int AS total_failed,
    count(*) FILTER(WHERE l.status IN ('sent','delivered') AND l.sent_at>=date_trunc('month',now()))::int AS emails_sent_this_month
    FROM email_api_logs l JOIN email_key_state s ON s.key_id=l.api_key_id WHERE s.project_id=$1 AND l.user_id=$2`, [project.id,userId]);
  const presentedKeys = keys.rows.map(row => {
    const key = camelRow(row);
    key.emailsSentMonth = key.quotaUsed;
    key.monthlyLimit = key.quotaLimit;
    return presentEmailApiKey(key, ownerEmail);
  });
  return { project, keys: presentedKeys, domains: domains.rows.map(camelRow), logs: logs.rows.map(camelRow),
    stats: { ...camelRow(counts), totalKeys: keys.rowCount, verifiedDomains: domains.rows.filter(d=>d.status==="verified").length,
      founderAccess: isFounderEmail(ownerEmail) } };
}
export async function createProjectEmailKey(userId: string, ownerEmail: unknown, projectId: unknown, name: unknown, rotateId?: number) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) integrationError(400, "Enter a key name (up to 120 characters)");
  const secretKey = `sk_live_${crypto.randomBytes(32).toString("hex")}`;
  const hash = await bcrypt.hash(secretKey, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [project] } = await client.query("SELECT * FROM email_projects WHERE id=$1 AND user_id=$2 FOR UPDATE", [integrationId(projectId),userId]);
    if (!project) integrationError(404, "Email project not found");
    let previous: any;
    if (rotateId) {
      const { rows } = await client.query(`SELECT k.*,s.quota_key_id,s.revoked_at FROM email_api_keys k
        JOIN email_key_state s ON s.key_id=k.id WHERE k.id=$1 AND k.user_id=$2 AND s.project_id=$3 FOR UPDATE OF s,k`,
        [rotateId,userId,project.id]);
      previous = rows[0];
      if (!previous || previous.revoked_at) integrationError(409, "This key cannot be rotated");
      const activeReplacement = await client.query(`SELECT 1 FROM email_key_state s JOIN email_api_keys k ON k.id=s.key_id
        WHERE s.replaces_key_id=$1 AND s.revoked_at IS NULL AND k.is_active`, [rotateId]);
      if (activeReplacement.rowCount) integrationError(409, "An active replacement already exists. Revoke that replacement first if its secret was lost.");
    } else {
      const verified = await client.query(`SELECT 1 FROM email_project_domains a JOIN email_api_domains d ON d.id=a.domain_id
        WHERE a.project_id=$1 AND d.user_id=$2 AND d.status='verified' LIMIT 1`, [project.id,userId]);
      if (!verified.rowCount) integrationError(409, "Verify a sending domain in this project before creating a key");
    }
    await client.query("SELECT set_config('afro.managed_email_insert','yes',true)");
    const { rows: [key] } = await client.query(`INSERT INTO email_api_keys(user_id,name,public_key,secret_key_hash,
      secret_key_preview,plan,monthly_limit,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,true) RETURNING *`,
      [userId,name.trim(),`afro_live_${crypto.randomBytes(20).toString("hex")}`,hash,secretKey.slice(-4),
        previous?.plan || (isFounderEmail(ownerEmail) ? "enterprise" : "starter"),previous?.monthly_limit || 1000]);
    await client.query(`INSERT INTO email_key_state(key_id,project_id,quota_key_id,replaces_key_id,secret_fingerprint)
      VALUES($1,$2,$3,$4,$5)`, [key.id,project.id,previous?.quota_key_id || key.id,rotateId || null,crypto.createHash("sha256").update(secretKey).digest("hex")]);
    await client.query("COMMIT");
    return { ...presentEmailApiKey({...camelRow(key),projectId:project.id,quotaKeyId:previous?.quota_key_id || key.id,
      replacesKeyId:rotateId || null,revokedAt:null},ownerEmail),secretKey };
  } catch (e) {
    await client.query("ROLLBACK"); throw e;
  } finally { client.release(); }
}
export async function revokeProjectEmailKey(userId: string, keyId: unknown) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(`SELECT s.key_id FROM email_key_state s JOIN email_api_keys k ON k.id=s.key_id
      WHERE k.id=$1 AND k.user_id=$2 FOR UPDATE OF s,k`, [integrationId(keyId),userId]);
    if (!owned.rowCount) integrationError(404,"API key not found");
    await client.query("UPDATE email_key_state SET revoked_at=coalesce(revoked_at,now()) WHERE key_id=$1", [keyId]);
    await client.query("UPDATE email_api_keys SET is_active=false WHERE id=$1", [keyId]);
    await client.query("COMMIT");
    return { success:true };
  } catch(e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
