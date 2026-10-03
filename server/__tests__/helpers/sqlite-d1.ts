import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Real SQLite statements/transactions, no network or live databases. */
export function sqliteD1() {
  const dir = mkdtempSync(join(tmpdir(), "auth-d1-test-"));
  const path = join(dir, "auth.sqlite");
  const query = (sql: string) => JSON.parse(execFileSync("sqlite3", ["-json", path, sql], { encoding: "utf8" }) || "[]");
  function prepare(sql: string) {
    let values: any[] = [];
    const text = () => {
      let index = 0;
      return sql.replace(/\?/g, () => {
        const value = values[index++];
        return value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
      });
    };
    const statement = {
      bind: (...params: any[]) => { values = params; return statement; },
      first: async () => query(text())[0] || null,
      all: async () => ({ results: query(text()) }),
      run: async () => ({ meta: query(`${text()}; SELECT changes() AS changes;`)[0] }),
      text,
    };
    return statement;
  }
  return {
    prepare, query,
    exec: (sql: string) => execFileSync("sqlite3", [path], { input: sql }),
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      const output = execFileSync("sqlite3", ["-json", path,
        `BEGIN; ${statements.map(s => `${s.text()}; SELECT changes() AS changes;`).join("\n")} COMMIT;`], { encoding: "utf8" });
      return output.trim().split("\n").filter(Boolean).map(line => ({ meta: JSON.parse(line)[0] }));
    },
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}