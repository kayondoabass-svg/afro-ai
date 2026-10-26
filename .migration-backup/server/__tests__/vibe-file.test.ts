import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RequestHandler } from "express";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../replit_integrations/auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) =>
    req.isAuthenticated() ? next() : res.status(401).json({ message: "Unauthorized" }),
  isFounder: (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if (req.user?.claims?.email !== "kayondoabass@gmail.com")
      return res.status(403).json({ message: "Forbidden: Founder access only" });
    next();
  },
}));

import { registerVibeRoutes } from "../vibe-routes";

const routes = new Map<string, RequestHandler[]>();
registerVibeRoutes({
  get: (name: string, ...handlers: RequestHandler[]) => { routes.set(`GET ${name}`, handlers); },
  post: (name: string, ...handlers: RequestHandler[]) => { routes.set(`POST ${name}`, handlers); },
} as any);

async function request(filePath: string, email?: string, authenticated = true) {
  const handlers = routes.get("GET /api/vibe/file")!;
  let status = 200;
  let body: any;
  const res = {
    status(code: number) { status = code; return this; },
    json(data: any) { body = data; return this; },
  };
  const req = {
    query: { path: filePath },
    isAuthenticated: () => authenticated,
    user: { claims: { email } },
  };
  let nextCalled = false;
  await handlers[0](req as any, res as any, () => { nextCalled = true; });
  if (nextCalled) await handlers[1](req as any, res as any, () => {});
  return { status, body };
}

let dir: string;
let outside: string;
let relative: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(process.cwd(), "vibe-test-"));
  outside = await mkdtemp(path.join(tmpdir(), "vibe-outside-"));
  relative = path.relative(process.cwd(), dir);
  await mkdir(path.join(dir, "src"));
  await writeFile(path.join(dir, "src", "app.ts"), "export const safe = true;\n");
  await writeFile(path.join(dir, ".env"), "SENSITIVE=never-expose\n");
  await writeFile(path.join(dir, ".env.production"), "SENSITIVE=never-expose\n");
  await writeFile(path.join(dir, ".env.local"), "SENSITIVE=never-expose\n");
  await writeFile(path.join(dir, ".envrc"), "SENSITIVE=never-expose\n");
  await writeFile(path.join(dir, "private.key"), "SENSITIVE=never-expose\n");
  await mkdir(path.join(dir, ".hidden"));
  await writeFile(path.join(dir, ".hidden", "file.ts"), "SENSITIVE=never-expose\n");
  await writeFile(path.join(outside, "outside.ts"), "SENSITIVE=never-expose\n");
  await symlink(path.join(outside, "outside.ts"), path.join(dir, "outside-link.ts"));
  await symlink(path.join(dir, ".env.production"), path.join(dir, "env-link.ts"));
  await symlink(outside, path.join(dir, "outside-dir"));
});
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  if (outside) await rm(outside, { recursive: true, force: true });
});

describe("vibe host file endpoint", () => {
  it("rejects anonymous and ordinary authenticated users before reading source", async () => {
    expect((await request("server/vibe-routes.ts", undefined, false)).status).toBe(401);
    expect((await request("server/vibe-routes.ts", "user@example.com")).status).toBe(403);
    expect((await request(`${relative}/.env.production`, "user@example.com")).status).toBe(403);
  });

  it("preserves founder access to ordinary source snippets", async () => {
    const response = await request(`${relative}/src/app.ts`, "kayondoabass@gmail.com");
    expect(response.status).toBe(200);
    expect(response.body.snippet).toContain("export const safe = true");
    expect(response.body.language).toBe("typescript");
  });

  it.each([
    ".env", ".env.production", ".env.local", ".envrc", "private.key",
    ".hidden/file.ts", "env-link.ts", "outside-link.ts", "outside-dir/outside.ts",
  ])("blocks sensitive path or symlink %s even for the founder", async name => {
    const response = await request(`${relative}/${name}`, "kayondoabass@gmail.com");
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain("SENSITIVE");
  });

  it.each([
    "../outside.ts", "/etc/passwd", `${process.cwd()}/server/vibe-routes.ts`,
    "server/../../etc/passwd", "server\\..\\..\\etc\\passwd",
    `${relative}/src/../src/app.ts`,
  ])("blocks absolute and traversal path %s", async name => {
    expect((await request(name, "kayondoabass@gmail.com")).status).toBe(403);
  });
});