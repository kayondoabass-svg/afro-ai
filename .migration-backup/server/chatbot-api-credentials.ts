import crypto from "node:crypto";
import { pool } from "./db";
import { camelRow, integrationError, integrationId } from "./email-projects";

const digest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const fields = "id,name,prefix,replaces_key_id,created_at,last_used_at,revoked_at";
export async function ownedChatbotApiPolicy(userId: string, widgetId: unknown) {
  const { rows } = await pool.query(`SELECT p.enforcement FROM chatbot_widgets w
    LEFT JOIN chatbot_api_policy p ON p.widget_id=w.id WHERE w.id=$1 AND w.user_id=$2`,
    [integrationId(widgetId),userId]);
  if (!rows[0]) integrationError(404,"Chatbot not found");
  if (!rows[0].enforcement) integrationError(503,"Chatbot API setup is not ready");
  return rows[0].enforcement as "legacy" | "required";
}
export async function listChatbotApiCredentials(userId: string, widgetId: unknown) {
  const enforcement = await ownedChatbotApiPolicy(userId,widgetId);
  const { rows } = await pool.query(`SELECT ${fields} FROM chatbot_api_credentials
    WHERE widget_id=$1 ORDER BY created_at DESC`,[widgetId]);
  return { enforcement, keys:rows.map(camelRow) };
}
export async function createChatbotApiCredential(userId: string, widgetId: unknown, name: unknown, replacesId?: string) {
  await ownedChatbotApiPolicy(userId,widgetId);
  if (typeof name !== "string" || !name.trim() || name.trim().length>120) integrationError(400,"Enter a key name (up to 120 characters)");
  const id = crypto.randomUUID().replaceAll("-","");
  const secretKey = `sk_chatbot_${id}_${crypto.randomBytes(32).toString("hex")}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query("SELECT id FROM chatbot_widgets WHERE id=$1 AND user_id=$2 FOR UPDATE",[widgetId,userId]);
    if (!owned.rowCount) integrationError(404,"Chatbot not found");
    if (replacesId) {
      const old = await client.query("SELECT id FROM chatbot_api_credentials WHERE id=$1 AND widget_id=$2 AND revoked_at IS NULL",[replacesId,widgetId]);
      if (!old.rowCount) integrationError(409,"This credential cannot be rotated");
      const replacement = await client.query("SELECT 1 FROM chatbot_api_credentials WHERE replaces_key_id=$1 AND revoked_at IS NULL",[replacesId]);
      if (replacement.rowCount) integrationError(409,"A replacement already exists. Revoke that replacement first if its secret was lost.");
    }
    const { rows:[row] } = await client.query(`INSERT INTO chatbot_api_credentials
      (id,widget_id,name,prefix,secret_hash,replaces_key_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${fields}`,
      [id,widgetId,name.trim(),`sk_chatbot_${id}`,digest(secretKey),replacesId || null]);
    await client.query("COMMIT");
    return {key:camelRow(row),secretKey};
  } catch(e) { await client.query("ROLLBACK"); throw e; }
  finally {client.release();}
}
export async function revokeChatbotApiCredential(userId:string,widgetId:unknown,keyId:string) {
  await ownedChatbotApiPolicy(userId,widgetId);
  const {rowCount} = await pool.query(`UPDATE chatbot_api_credentials SET revoked_at=coalesce(revoked_at,now())
    WHERE id=$1 AND widget_id=$2 AND EXISTS(SELECT 1 FROM chatbot_widgets WHERE id=$2 AND user_id=$3)`,
    [keyId,widgetId,userId]);
  if (!rowCount) integrationError(404,"Credential not found");
  return {success:true};
}
export async function enforcePrivateChatbotApi(userId:string,widgetId:unknown) {
  await ownedChatbotApiPolicy(userId,widgetId);
  // Serialize key creation and explicit migration. Revocation may still stop
  // an already configured integration, including when its last key is revoked.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM chatbot_widgets WHERE id=$1 AND user_id=$2 FOR UPDATE",[widgetId,userId]);
    const active = await client.query("SELECT 1 FROM chatbot_api_credentials WHERE widget_id=$1 AND revoked_at IS NULL LIMIT 1",[widgetId]);
    if (!active.rowCount) integrationError(409,"Create and deploy a private key before enabling enforcement");
    await client.query("UPDATE chatbot_api_policy SET enforcement='required' WHERE widget_id=$1",[widgetId]);
    await client.query("COMMIT");
    return {enforcement:"required"};
  } catch(e) {await client.query("ROLLBACK");throw e;}
  finally {client.release();}
}
// null means invalid, never a request to retry public-ID authentication.
export async function resolvePrivateChatbotApiKey(token:string) {
  const match=token.match(/^sk_chatbot_([a-f0-9]{32})_([a-f0-9]{64})$/);
  if (!match) return null;
  const {rows:[row]}=await pool.query(`SELECT widget_id,secret_hash FROM chatbot_api_credentials
    WHERE id=$1 AND revoked_at IS NULL`,[match[1]]);
  if (!row || !/^[a-f0-9]{64}$/.test(row.secret_hash) ||
    !crypto.timingSafeEqual(Buffer.from(row.secret_hash,"hex"),Buffer.from(digest(token),"hex"))) return null;
  await pool.query("UPDATE chatbot_api_credentials SET last_used_at=now() WHERE id=$1 AND revoked_at IS NULL",[match[1]]);
  return row.widget_id as number;
}
export async function chatbotLegacyApiAllowed(widgetId:number) {
  const {rows:[row]}=await pool.query("SELECT enforcement FROM chatbot_api_policy WHERE widget_id=$1",[widgetId]);
  return row?.enforcement==="legacy";
}
