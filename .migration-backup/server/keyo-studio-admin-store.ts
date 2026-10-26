import { pool } from "./db";

export interface KeyoInvite { email: string; createdAt: string }
export interface KeyoAdminStore {
  hasInvite(email: string): Promise<boolean>;
  listInvites(): Promise<KeyoInvite[]>;
  grant(email: string, actor: string): Promise<void>;
  revoke(email: string): Promise<void>;
  touch(userId: string, email: string): Promise<void>;
  leave(userId: string): Promise<void>;
  activeCount(founderEmail: string): Promise<number>;
}

let ready: Promise<void> | undefined;
function ensureTables() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS keyo_studio_invites (
      email TEXT PRIMARY KEY, created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS keyo_studio_presence (
      user_id TEXT PRIMARY KEY, email TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `).then(() => undefined).catch(error => { ready = undefined; throw error; });
  return ready;
}

export const keyoAdminStore: KeyoAdminStore = {
  async hasInvite(email) {
    await ensureTables();
    const result = await pool.query("SELECT 1 FROM keyo_studio_invites WHERE email = $1", [email]);
    return result.rowCount === 1;
  },
  async listInvites() {
    await ensureTables();
    const result = await pool.query('SELECT email, created_at AS "createdAt" FROM keyo_studio_invites ORDER BY created_at DESC');
    return result.rows.map(row => ({ email: row.email, createdAt: new Date(row.createdAt).toISOString() }));
  },
  async grant(email, actor) {
    await ensureTables();
    await pool.query("INSERT INTO keyo_studio_invites(email, created_by) VALUES($1, $2) ON CONFLICT(email) DO NOTHING", [email, actor]);
  },
  async revoke(email) {
    await ensureTables();
    await pool.query("DELETE FROM keyo_studio_invites WHERE email = $1", [email]);
  },
  async touch(userId, email) {
    await ensureTables();
    // Expired rows are removed so presence does not become activity history.
    await pool.query("DELETE FROM keyo_studio_presence WHERE expires_at <= now()");
    await pool.query(`INSERT INTO keyo_studio_presence(user_id,email,expires_at)
      VALUES($1,$2,now() + interval '90 seconds')
      ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email, expires_at=EXCLUDED.expires_at`, [userId, email]);
  },
  async leave(userId) {
    await ensureTables();
    await pool.query("DELETE FROM keyo_studio_presence WHERE user_id = $1", [userId]);
  },
  async activeCount(founderEmail) {
    await ensureTables();
    const result = await pool.query(`SELECT count(*)::int AS count FROM keyo_studio_presence p
      WHERE p.expires_at > now() AND (p.email=$1 OR EXISTS
        (SELECT 1 FROM keyo_studio_invites i WHERE i.email=p.email))`, [founderEmail]);
    return result.rows[0].count;
  },
};
