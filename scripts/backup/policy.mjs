export const PREFIX = "afro-ai-recovery/v1/";
export const RETENTION_DAYS = 7;
export const MAX_ARCHIVE_BYTES = 25_000_000;
export const MAX_STORED_BYTES = 2_000_000_000;
export const MAX_WORK_BYTES = 25_000_000;
const RUN = /^\d{13}-[a-f0-9]{16}$/;
export function runKeys(id) {
  if (!RUN.test(id)) throw new Error("Invalid backup identifier");
  return { archive: `${PREFIX}${id}.tar.gz`, manifest: `${PREFIX}${id}.json` };
}
export function expiredRuns(objects, now, currentId) {
  const cutoff = now - RETENTION_DAYS * 86400000;
  return objects.flatMap(o => {
    const match = o.Key?.match(/^afro-ai-recovery\/v1\/(\d{13}-[a-f0-9]{16})\.json$/);
    return match && match[1] !== currentId && Number(match[1].slice(0, 13)) < cutoff
      ? [match[1]] : [];
  });
}
export function quoteIdentifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Unsupported SQL identifier");
  return `"${name}"`;
}
export function validManifest(m, id) {
  return m?.kind === "afro-ai-recovery" && m.version === 1 && m.runId === id &&
    m.status === "verified" && m.retentionDays === RETENTION_DAYS &&
    m.archiveReadBackVerified === true && m.assetsVerified === true &&
    m.restoredPostgresTables > 0 && m.restoredD1Databases >= 3 &&
    /^[a-f0-9]{64}$/.test(m.sha256 ?? "");
}
