// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { registerKeyoStudioAdmin } from "../keyo-studio-admin";
import type { KeyoAdminStore } from "../keyo-studio-admin-store";

const founder = "owner@example.test";
const invites = new Map<string, string>();
const presence = new Map<string, { email: string; expires: number }>();
const store: KeyoAdminStore = {
  async hasInvite(email) { return invites.has(email); },
  async listInvites() { return [...invites].map(([email, createdAt]) => ({ email, createdAt })); },
  async grant(email) { invites.set(email, new Date().toISOString()); },
  async revoke(email) { invites.delete(email); },
  async touch(id, email) { presence.set(id, { email, expires: Date.now() + 90_000 }); },
  async leave(id) { presence.delete(id); },
  async activeCount() {
    return [...presence.values()].filter(p => p.expires > Date.now() && (p.email === founder || invites.has(p.email))).length;
  },
};
let server: Server, origin: string;
const base = "/api/keyo-studio/admin";
async function call(path = "", email?: string, method = "GET", body?: unknown, extras = {}) {
  return fetch(origin + base + path, { method, headers: {
    ...(email ? { "x-test-email": email } : {}), "Content-Type": "application/json", ...extras,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerKeyoStudioAdmin(app, { store, founderEmail: founder,
    authenticate: (req: any, res, next) => {
      const email = req.get("x-test-email");
      if (!email) return void res.status(401).json({ message: "Sign in required." });
      req.user = { claims: { sub: email, email, email_verified: req.get("x-test-unverified") !== "1" } };
      next();
    },
    getRelease: async () => ({ version: "test-alpha", downloadUrl: "/downloads/keyo-studio/test.tgz" }),
  });
  server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe("Private KEYO founder dashboard", () => {
  it("blocks anonymous, unauthorized and unverified accounts without disclosing data", async () => {
    expect((await call()).status).toBe(401);
    const denied = await call("", "stranger@example.test");
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("test-alpha");
    expect((await call("", founder, "GET", undefined, { "x-test-unverified": "1" })).status).toBe(403);
  });
  it("lets only the founder grant normalized, persistent viewer access", async () => {
    expect((await call("/invites", founder, "POST", { email: "invalid" })).status).toBe(400);
    expect((await call("/invites", founder, "POST", { email: " VIEWER@EXAMPLE.TEST " })).status).toBe(201);
    expect(invites.has("viewer@example.test")).toBe(true);
    const viewer = await (await call("", "viewer@example.test")).json();
    expect(viewer.isFounder).toBe(false);
    expect(viewer.invites).toEqual([]);
    expect(viewer.authorizedUsersCount).toBe(2);
    expect((await call("/invites", "viewer@example.test", "POST", { email: "third@example.test" })).status).toBe(403);
    expect((await call("/invites/viewer%40example.test", "viewer@example.test", "DELETE")).status).toBe(403);
  });
  it("rejects cross-origin changes", async () => {
    expect((await call("/invites", founder, "POST", { email: "bad@example.test" }, { origin: "https://attacker.test" })).status).toBe(403);
    expect(invites.has("bad@example.test")).toBe(false);
  });
  it("counts distinct recently active viewers and expires presence", async () => {
    await call("/presence", founder, "POST", {});
    await call("/presence", "viewer@example.test", "POST", {});
    await call("/presence", "viewer@example.test", "POST", {});
    const info = await (await call("", founder)).json();
    expect(info.isFounder).toBe(true);
    expect(info.activeViewersCount).toBe(2);
    expect(info.invites).toHaveLength(1);
    expect((await call("", founder)).headers.get("cache-control")).toBe("private, no-store");
    presence.get("viewer@example.test")!.expires = Date.now() - 1;
    expect((await (await call("", founder)).json()).activeViewersCount).toBe(1);
  });
  it("revokes every viewer operation immediately and does not count revoked users", async () => {
    await call("/presence", "viewer@example.test", "POST", {});
    expect((await call("/invites/viewer%40example.test", founder, "DELETE")).status).toBe(200);
    expect((await call("", "viewer@example.test")).status).toBe(403);
    expect((await call("/presence", "viewer@example.test", "POST", {})).status).toBe(403);
    expect((await (await call("", founder)).json()).activeViewersCount).toBe(1);
    await call("/presence", founder, "DELETE");
    expect((await (await call("", founder)).json()).activeViewersCount).toBe(0);
  });
});
