import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import type { Db, Programme } from "./core";
import { hash, tables } from "./core";
import { pool } from "../db";
import { sendProgrammeEmail } from "../mailer";
import {FOUNDER_EMAILS} from "../founder-access";

function key() {
  if (!process.env.SESSION_SECRET) throw new Error("Programme mail encryption is not configured.");
  return createHash("sha256").update(process.env.SESSION_SECRET).digest();
}
function encrypt(value: object) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(b => b.toString("base64")).join(".");
}
function decrypt(value: string) {
  const [iv, tag, body] = value.split(".").map(s => Buffer.from(s, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(body), cipher.final()]).toString("utf8"));
}
export async function queueMail(db: Db, p: Programme, id: number, eventKey: string, recipient: string,
  subject: string, text: string, actionPath = "/programme-portal") {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("Programme notification recipient is not configured.");
  await db.query(`INSERT INTO programme_mail_jobs(programme,application_id,event_key,recipient,subject,encrypted_payload)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_key) DO NOTHING`,
    [p, id, `${p}:${id}:${eventKey}:${hash(recipient)}`, recipient, subject, encrypt({ text, actionPath })]);
}
let busy = false;
// Legacy applications may predate the durable mail queue. Only the founder is
// notified here; never replay applicant receipts or retry an uncertain delivery.
export async function queueMissingFounderApplicationMail(db:Db=pool,recipient=FOUNDER_EMAILS[0]) {
  for(const p of ["affiliate","business"] as const) {
    const {rows}=await db.query(`SELECT a.id,a.${tables[p].name} AS display_name,a.email
      FROM ${tables[p].app} a WHERE a.status='pending' AND NOT EXISTS(
        SELECT 1 FROM programme_mail_jobs m WHERE m.programme=$1 AND m.application_id=a.id
          AND m.event_key=concat($1::text,':',a.id,':application-founder:',$2::text))
      ORDER BY a.id LIMIT 25`,[p,hash(recipient)]);
    for(const row of rows)await queueMail(db,p,row.id,"application-founder",recipient,
      "Afro AI programme application awaiting your review",
      `A ${p==="affiliate"?"individual affiliate":"business partner"} application is waiting for your review.\nApplicant: ${row.display_name}\nEmail: ${row.email}\nReference: ${p}-${row.id}\n\nThis application had no saved founder notification. Open its record to review the details and take the next step. No approval or money transfer has occurred.`,
      `/founder?programme=${p}&application=${row.id}`);
  }
}
export async function deliverProgrammeMail() {
  if (busy) return;
  busy = true;
  try {
    // A crashed or ambiguous attempt must never be automatically sent twice.
    await pool.query(`UPDATE programme_mail_jobs SET state='uncertain'
      WHERE state='sending' AND attempted_at<now()-interval '10 minutes'`);
    const { rows } = await pool.query(`UPDATE programme_mail_jobs SET state='sending',attempted_at=now()
      WHERE id IN(SELECT id FROM programme_mail_jobs WHERE state='queued'
        ORDER BY id LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING id,recipient,subject,encrypted_payload`);
    for (const row of rows) {
      let sent = false;
      try { sent = await sendProgrammeEmail(row.recipient, { subject: row.subject, ...decrypt(row.encrypted_payload) }); }
      catch { /* Do not log provider diagnostics or invitation tokens. */ }
      await pool.query("UPDATE programme_mail_jobs SET state=$2 WHERE id=$1", [row.id, sent ? "sent" : "uncertain"]);
    }
  } catch { console.error("[programmes] Notification delivery check failed; saved applications are retained."); }
  finally { busy = false; }
}
export function startProgrammeMailWorker() {
  let running=false,nextCatchup=0;
  const tick=async()=>{
    if(running)return;
    running=true;
    try {
      // Development fixtures must not become unsolicited real founder emails.
      if(process.env.NODE_ENV==="production" && Date.now()>=nextCatchup) {
        nextCatchup=Date.now()+5*60_000;
        try{await queueMissingFounderApplicationMail();}
        catch{console.error("[programmes] Founder notification catch-up pending; applications are retained.");}
      }
      await deliverProgrammeMail();
    } finally {running=false;}
  };
  const timer = setInterval(() => void tick(), 15000); timer.unref();
  void tick();
}
export async function resendProgrammeMail(id: number, actor: string) {
  const { rows } = await pool.query("SELECT * FROM programme_mail_jobs WHERE id=$1", [id]);
  const row = rows[0];
  if (!row) throw new Error("Notification not found.");
  if (row.state === "sending") throw new Error("Notification is still being processed.");
  await queueMail(pool, row.programme, row.application_id, `explicit-resend:${actor}:${randomBytes(12).toString("hex")}`,
    row.recipient, row.subject, decrypt(row.encrypted_payload).text, decrypt(row.encrypted_payload).actionPath);
}
