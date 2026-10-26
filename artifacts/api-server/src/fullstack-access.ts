import { pool } from "./db";
import { ProjectFileError } from "./project-file-policy";

export const FULLSTACK_PAID_REASON = "Full-stack projects require a paid Pro or Business plan, or a funded pay-as-you-go account.";

/** Billing records, not browser-supplied plans or trial flags, grant access. */
export async function fullstackAccess(userId: string) {
  if (!userId) return { allowed: false, reason: FULLSTACK_PAID_REASON };
  const { rows } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM users u WHERE u.id = $1
      AND u.plan IN ('pro', 'business', 'payg')
      AND (u.plan <> 'payg' OR u.payg_balance > 0)
      AND EXISTS (
        SELECT 1 FROM payments p WHERE p.user_id = u.id
        AND p.status = 'completed' AND p.amount > 0
        AND (p.plan IN ('pro', 'business') OR p.plan IN ('payg-pack5', 'payg-pack10', 'payg-pack20', 'payg-pack50'))
      )
    ) AS allowed`, [userId]);
  return { allowed: rows[0]?.allowed === true, reason: FULLSTACK_PAID_REASON };
}

export async function requireFullstackAccess(userId: string) {
  if (!(await fullstackAccess(userId)).allowed) throw new ProjectFileError(403, FULLSTACK_PAID_REASON);
}

export async function guardFullstackProject(userId: string, projectId?: number | null) {
  if (!projectId) return false;
  const { rows } = await pool.query("SELECT type FROM projects WHERE id = $1 AND user_id = $2", [projectId, userId]);
  if (!rows.length) throw new ProjectFileError(404, "project not found");
  if (rows[0].type !== "fullstack") return false;
  await requireFullstackAccess(userId);
  return true;
}