import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { z } from "zod";

export type Programme = "affiliate" | "business";
export type Identity = { id: string; email: string };
export type Db = Pick<PoolClient, "query">;
export class ProgrammeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const programme = (value: unknown): Programme => z.enum(["affiliate", "business"]).parse(value);
export const numericId = (value: unknown) => z.coerce.number().int().positive().max(2147483647).parse(value);
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const method = z.enum(["bank", "mobile_money"]);
export const tierRates = { authorized: 20, premium: 30, premier: 40 } as const;
export const tables = {
  affiliate: { app: "affiliate_applications", name: "full_name", commissions: "affiliate_commissions", beneficiary: "affiliate_id" },
  business: { app: "partner_applications", name: "company_name", commissions: "partner_commissions", beneficiary: "partner_id" },
} as const;

export async function transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try { await db.query("BEGIN"); const result = await fn(db); await db.query("COMMIT"); return result; }
  catch (e) { await db.query("ROLLBACK"); throw e; }
  finally { db.release(); }
}
export async function identity(req: any): Promise<Identity> {
  const id = req.user?.claims?.sub;
  if (!id) throw new ProgrammeError(401, "Please sign in.");
  const { rows } = await pool.query(
    "SELECT id,email FROM users WHERE id=$1 AND email_verified IS NOT NULL", [id]);
  if (!rows[0]?.email) throw new ProgrammeError(403, "Verify your account email before opening programme records.");
  return { id, email: rows[0].email.toLowerCase() };
}
export async function application(db: Db, p: Programme, id: number, lock = false) {
  const { rows } = await db.query(`SELECT a.*,to_jsonb(m) AS metadata,
    ${p === "business" ? "COALESCE(m.owner_user_id,(SELECT p.user_id FROM partners p WHERE p.application_id=a.id ORDER BY p.id LIMIT 1))" : "m.owner_user_id"} AS explicit_owner_id
    FROM ${tables[p].app} a
    LEFT JOIN programme_applications m ON m.programme=$1 AND m.application_id=a.id
    WHERE a.id=$2 ${lock ? "FOR UPDATE OF a" : ""}`, [p, id]);
  if (!rows[0]) throw new ProgrammeError(404, "Application not found.");
  return rows[0];
}
export async function access(db: Db, p: Programme, id: number, who: Identity, founder = false, lock = false) {
  const app = await application(db, p, id, lock);
  if (founder) return { app, role: "owner" as string };
  const owner = app.explicit_owner_id;
  if ((owner && owner === who.id) || (!owner && app.email.toLowerCase() === who.email))
    return { app, role: "owner" as string };
  if (p === "business" && app.status === "approved") {
    const { rows } = await db.query(`SELECT role FROM programme_members
      WHERE application_id=$1 AND user_id=$2 AND status='active'`, [id, who.id]);
    if (rows[0]) return { app, role: rows[0].role as string };
  }
  throw new ProgrammeError(404, "Workspace not found.");
}
export function requireRole(role: string, roles: string[]) {
  if (!roles.includes(role)) throw new ProgrammeError(403, "Your business role does not permit this action.");
}
export async function event(db: Db, p: Programme, id: number, actor: string | null, action: string, detail = {}) {
  const { rows } = await db.query(`INSERT INTO programme_events(programme,application_id,actor_id,action,detail)
    VALUES($1,$2,$3,$4,$5) RETURNING id`, [p, id, actor, action, JSON.stringify(detail)]);
  return rows[0].id;
}
export async function ensureMetadata(db: Db, p: Programme, id: number) {
  await db.query(`INSERT INTO programme_applications(programme,application_id) VALUES($1,$2)
    ON CONFLICT DO NOTHING`, [p, id]);
}
export const csv = (rows: Record<string, unknown>[]) => {
  const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^\s*[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [keys.map(cell).join(","), ...rows.map(row => keys.map(k => cell(row[k])).join(","))].join("\r\n");
};
