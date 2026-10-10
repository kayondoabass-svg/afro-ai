import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { d1GetDatabaseInfo, d1Query, isD1Configured } from "../server/d1";

export async function knowledgeStoragePreflight(apply = false) {
  const id = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const name = process.env.PROJECT_FILES_D1_DATABASE_NAME;
  if (!isD1Configured() || !id || !name || name === "afro-ai-auth") throw new Error("Dedicated project-files D1 configuration required");
  const actual = await d1GetDatabaseInfo();
  if (actual.uuid !== id || actual.name !== name || actual.name === "afro-ai-auth") throw new Error("Project-files D1 identity mismatch");
  if (apply) {
    // One additive CREATE TABLE statement, no triggers/ALTER/data deletion.
    const migration = await readFile(new URL("../cloudflare/migrations/004_chatbot_knowledge_folders.sql", import.meta.url), "utf8");
    await d1Query(migration);
  }
  const columns = (await d1Query("PRAGMA table_info(chatbot_knowledge_files)")).results;
  const required = ["user_id", "widget_id", "path", "content", "version", "updated_at"];
  if (!required.every(c => columns.some(row => row.name === c))) throw new Error("Knowledge-folder migration 004 required");
  const primary = columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
  if (primary.join(",") !== "user_id,widget_id,path") throw new Error("Knowledge-folder ownership constraint missing");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  knowledgeStoragePreflight(process.argv.includes("--apply")).then(() => {
    console.log(process.argv.includes("--apply") ? "Private knowledge-folder migration applied and verified." : "Private knowledge-folder schema ready; no changes made.");
  }).catch(() => {
    console.error("Knowledge-folder preflight failed: check dedicated D1 identity, connectivity and migration 004. No existing customer data was deleted.");
    process.exitCode = 1;
  });
}
