import { validateProjectFiles, type ProjectFile } from "./project-file-policy";

/** Deterministic source-only starter; no credentials, paid API calls or provisioning. */
export function fullstackStarterFiles(): ProjectFile[] {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({
      name: "afro-fullstack-app", version: "1.0.0", private: true, type: "module",
      scripts: {
        dev: "wrangler dev", "dev:client": "vite --host 0.0.0.0",
        build: "vite build", check: "tsc --noEmit", test: "vitest run",
        deploy: "npm run build && wrangler deploy",
        "db:local": "wrangler d1 migrations apply DB --local",
        "db:remote": "wrangler d1 migrations apply DB --remote",
      },
      dependencies: { hono: "^4.7.0", react: "^18.3.1", "react-dom": "^18.3.1" },
      devDependencies: {
        "@cloudflare/workers-types": "^4.20250301.0", "@types/react": "^18.3.0",
        "@types/react-dom": "^18.3.0", "@vitejs/plugin-react": "^4.3.0",
        typescript: "^5.6.3", vite: "^6.1.0", vitest: "^3.0.0", wrangler: "^4.0.0",
      },
    }, null, 2),
    "tsconfig.json": JSON.stringify({ compilerOptions: {
      target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext",
      moduleResolution: "Bundler", jsx: "react-jsx", strict: true, noEmit: true,
      skipLibCheck: true, esModuleInterop: true, types: ["@cloudflare/workers-types"],
    }, include: ["client/src", "server", "shared", "tests", "vite.config.ts"] }, null, 2),
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "client", plugins: [react()],
  build: { outDir: "../dist/client", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
`,
    "vitest.config.ts": `import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], environment: "node" } });
`,
    "wrangler.toml": `name = "afro-fullstack-app"
main = "server/index.ts"
compatibility_date = "2025-03-01"

[assets]
directory = "./dist/client"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "YOUR_DATABASE_NAME"
database_id = "YOUR_DATABASE_ID"
migrations_dir = "migrations"
`,
    ".gitignore": `node_modules/\ndist/\n.wrangler/\n.env\n.env.*\n!.env.example\n.dev.vars\n.dev.vars.*\ncoverage/\n`,
    ".env.example": "# This starter has no required secret values.\n# D1 uses the DB binding in wrangler.toml, not a database password.\n# Never put private keys in chat, source code, or VITE_ variables.\n",
    "README.md": `# Afro AI full-stack starter

React + TypeScript frontend, Hono on Cloudflare Workers, and a D1 binding.

## Current state
Afro AI has saved these source files only. No Worker, D1 database, live backend, or secret has been provisioned. Static website publishing does not deploy this project.

## Run in your own development environment
1. Install Node.js 20.19+ and run \`npm install\`. Commit the generated package-lock.json for reproducible installs.
2. Authenticate Wrangler to your Cloudflare account.
3. Choose a unique Worker name in wrangler.toml. Create a D1 database with \`npx wrangler d1 create your-app-db\`.
4. Replace YOUR_DATABASE_NAME and YOUR_DATABASE_ID in wrangler.toml using the result.
5. Run \`npm run db:local\`, \`npm run build\`, then \`npm run dev\`.
6. For frontend hot reload, also run \`npm run dev:client\`; Vite proxies /api to Wrangler on port 8787.
7. Run \`npm run check\` and \`npm test\`.

## Publish later, when ready
Run \`npm run db:remote\`, then \`npm run deploy\` from your own environment. Cloudflare usage and billing apply. Afro AI does not execute these commands at project creation.

## Security and data
The example exposes only health and a fixed read-only service-message query. It has no login or public write API. Add authentication, authorization, request validation and rate limits before adding sensitive data or writes. Use Wrangler secrets for backend secrets; never paste private keys in chat or expose them to client code. The D1 database holds your app data, separately from Afro AI's source-file storage.
`,
    "client/index.html": `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>My full-stack app</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
    "client/src/main.tsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
`,
    "client/src/App.tsx": `import { useEffect, useState } from "react";
import { getMessage } from "./lib/api";
export default function App() {
  const [message, setMessage] = useState("Connecting to your backend…");
  useEffect(() => {
    const controller = new AbortController();
    getMessage(controller.signal).then(data => setMessage(data.message)).catch(error => {
      if (!controller.signal.aborted) setMessage(error.message);
    });
    return () => controller.abort();
  }, []);
  return <main><h1>Your full-stack app</h1><p role="status">{message}</p><p>React · Cloudflare Workers · D1</p></main>;
}
`,
    "client/src/styles.css": `:root{font-family:system-ui,sans-serif;color:#f5f3eb;background:#141410}body{margin:0}main{max-width:48rem;margin:12vh auto;padding:2rem}h1{color:#e3bc64}p{line-height:1.6;overflow-wrap:anywhere}`,
    "client/src/lib/api.ts": `import type { MessageResponse } from "../../../shared/types";
export async function getMessage(signal?: AbortSignal): Promise<MessageResponse> {
  const response = await fetch("/api/message", { signal });
  if (!response.ok) throw new Error("Backend unavailable. Configure D1, apply migrations and start the Worker.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("message" in data) || typeof data.message !== "string") throw new Error("Invalid backend response.");
  return { message: data.message };
}
`,
    "shared/types.ts": "export interface MessageResponse { message: string }\n",
    "server/env.ts": "export type Env = { DB: D1Database; ASSETS: Fetcher };\n",
    "server/db.ts": `import type { Env } from "./env";
export async function readServiceMessage(env: Env) {
  if (!env.DB) throw new Error("D1 binding not configured");
  return env.DB.prepare("SELECT message FROM app_messages WHERE id = ?").bind(1).first<{ message: string }>();
}
`,
    "server/routes.ts": `import { Hono } from "hono";
import type { Env } from "./env";
import { readServiceMessage } from "./db";
export const api = new Hono<{ Bindings: Env }>();
api.get("/health", c => c.json({ status: "ok" }));
api.get("/message", async c => {
  const row = await readServiceMessage(c.env);
  if (!row) return c.json({ error: "Apply the initial D1 migration" }, 503);
  return c.json({ message: row.message });
});
api.all("*", c => c.json({ error: "API route not found" }, 404));
`,
    "server/index.ts": `import { Hono } from "hono";
import type { Env } from "./env";
import { api } from "./routes";
const app = new Hono<{ Bindings: Env }>();
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  await next();
});
app.route("/api", api);
app.onError((_error, c) => c.json({ error: "Backend unavailable; check D1 configuration and migrations." }, 503));
app.get("*", c => c.env.ASSETS.fetch(c.req.raw));
export default app;
`,
    "migrations/0001_initial.sql": `CREATE TABLE IF NOT EXISTS app_messages (id INTEGER PRIMARY KEY, message TEXT NOT NULL);
INSERT OR IGNORE INTO app_messages (id, message) VALUES (1, 'Your Worker is connected to D1.');
`,
    "tests/api.test.ts": `import { describe, expect, it } from "vitest";
import app from "../server/index";
describe("API", () => {
  it("reports health", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
  it("fails explicitly without D1", async () => {
    const response = await app.request("/api/message");
    expect(response.status).toBe(503);
  });
  it("returns JSON for missing API routes", async () => {
    const response = await app.request("/api/missing");
    expect(response.status).toBe(404);
  });
});
`,
  };
  return validateProjectFiles(Object.entries(files).map(([path, content]) => ({
    path, name: path.split("/").at(-1)!,
    language: path.endsWith(".tsx") || path.endsWith(".ts") ? "typescript" : "text", content,
  })));
}