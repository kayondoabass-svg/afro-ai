import { pool } from "./db";
export interface KeyoDownloadStore {
  record(source: "platform" | "github-link" | "hugging-face-link", artifact: string): Promise<void>;
  summary(): Promise<{ startedAt: string; rows: { source: string; artifact: string; count: number }[] }>;
}
let ready: Promise<void> | undefined;
function ensure() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS keyo_download_tracking (
      id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id), started_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO keyo_download_tracking(id) VALUES(true) ON CONFLICT(id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS keyo_download_counts (
      source TEXT NOT NULL, artifact TEXT NOT NULL, day DATE NOT NULL,
      count BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(source,artifact,day)
    );
  `).then(()=>undefined).catch(error=>{ready=undefined;throw error;});
  return ready;
}
export const keyoDownloadStore: KeyoDownloadStore = {
  async record(source, artifact) {
    await ensure();
    await pool.query(`INSERT INTO keyo_download_counts(source,artifact,day,count)
      VALUES($1,$2,(now() AT TIME ZONE 'UTC')::date,1)
      ON CONFLICT(source,artifact,day) DO UPDATE SET count=keyo_download_counts.count+1`, [source,artifact]);
  },
  async summary() {
    await ensure();
    const [tracking,counts]=await Promise.all([
      pool.query("SELECT started_at FROM keyo_download_tracking WHERE id=true"),
      pool.query("SELECT source,artifact,SUM(count)::text AS count FROM keyo_download_counts GROUP BY source,artifact ORDER BY artifact"),
    ]);
    return {startedAt:new Date(tracking.rows[0].started_at).toISOString(),
      rows:counts.rows.map(row=>({...row,count:Number(row.count)}))};
  },
};
