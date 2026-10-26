// @vitest-environment node
import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  API_ALIASES, hasEndpointPreflight, resolveAuthApi, resolvePlatformApi,
} from "@shared/api-version-policy";
import { apiVersioning, registerApiVersionDocs, versionedApiNotFound } from "../api-versioning";
import { authOpenApi } from "../public-auth-docs";

let server: Server;
let base: string;
let calls = 0;
beforeAll(async () => {
  const app = express();
  app.use(apiVersioning);
  app.use(express.json({ verify: (req: any, _res, bytes) => { req.rawBody = bytes; } }));
  registerApiVersionDocs(app);
  app.post("/api/email-api/send", (req: any, res) => {
    calls++;
    res.status(202).json({
      body: req.body, raw: req.rawBody.toString(), query: req.query,
      authorization: req.get("authorization"), cookie: req.get("cookie"),
    });
  });
  app.get("/api/projects/:id", (req, res) => {
    if (req.get("authorization") !== "Bearer test-only") {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json({ id: req.params.id, name: "Existing project", owner: "test-owner" });
  });
  app.post("/api/v1/chatbot/message", (req, res) => {
    res.json({ reply: "Existing reply", sessionId: req.body.sessionId });
  });
  app.options("/api/widget-chat/:key", (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });
  app.post("/api/widget-chat/:key", (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.json({ reply: req.body.message, key: req.params.key });
  });
  app.get("/api/admin/status", (_req, res) => res.status(403).json({ message: "Founder only" }));
  app.get("/api/internal/status", (_req, res) => res.status(403).json({ message: "Internal only" }));
  app.use(versionedApiNotFound);
  app.use((_req, res) => res.type("html").send("Existing frontend"));
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

describe("v1 compatibility routing", () => {
  it.each(API_ALIASES)("maps $versioned without dropping resource suffixes", alias => {
    expect(resolvePlatformApi(`/api/v1/${alias.versioned}/example`)).toEqual({
      kind: "supported", version: "v1", target: `/api/${alias.legacy}/example`,
    });
  });
  it("retains bodies, raw bytes, query strings, cookies, credentials and status without a redirect", async () => {
    const before = calls;
    const body = '{"to":"test@example.test","subject":"Example","text":"Hi"}';
    const options = {
      method: "POST", body,
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-only", Cookie: "session=test-only" },
      redirect: "manual" as const,
    };
    const legacy = await fetch(base + "/api/email-api/send?mode=test&tag=one&tag=two", options);
    const versioned = await fetch(base + "/api/v1/email/send?mode=test&tag=one&tag=two", options);
    expect(legacy.status).toBe(202);
    expect(versioned.status).toBe(202);
    expect(versioned.headers.get("location")).toBeNull();
    expect(versioned.headers.get("x-afro-api-version")).toBe("v1");
    expect(versioned.headers.get("access-control-expose-headers")).toContain("X-Afro-API-Version");
    const original = await legacy.json();
    expect(await versioned.json()).toEqual(original);
    expect(original.raw).toBe(body);
    expect(original.query.tag).toEqual(["one", "two"]);
    expect(original.authorization).toBe("Bearer test-only");
    expect(original.cookie).toBe("session=test-only");
    expect(calls - before).toBe(2); // Once per request, not an internal replay.
  });
  it.each(["/api/v1/chatbot/message", "/API/V1/CHATBOT/MESSAGE/"])("keeps the existing explicit chatbot contract at %s", async path => {
    const response = await fetch(base + path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello", sessionId: "session-1" }),
    });
    expect(await response.json()).toEqual({ reply: "Existing reply", sessionId: "session-1" });
  });
  it.each([undefined, "Bearer test-only"])("retains management authentication and response fields for %s", async auth => {
    const headers = auth ? { Authorization: auth } : {};
    const old = await fetch(base + "/api/projects/project-1", { headers });
    const current = await fetch(base + "/api/v1/projects/project-1", { headers });
    expect(current.status).toBe(old.status);
    expect(await current.json()).toEqual(await old.json());
  });
  it.each(["GET", "POST", "OPTIONS"])("rejects an unsupported version for %s without executing an operation", async method => {
    const before = calls;
    const response = await fetch(base + "/api/v2/email/send", { method });
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("UNSUPPORTED_API_VERSION");
    expect(calls).toBe(before);
  });
  it.each(["/api/v1/admin/status", "/api/v1/internal/status", "/api/v1/founder/status", "/api/v1/d1/query", "/api/v1/projects/missing/route"])(
    "does not expose control-plane routes or fall through to SPA HTML at %s", async path => {
      const response = await fetch(base + path);
      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe("VERSIONED_ENDPOINT_NOT_FOUND");
    },
  );
  it.each(["/api/widget-chat/key-1", "/api/v1/widget-chat/key-1"])("preserves public widget CORS at %s", async path => {
    const response = await fetch(base + path, {
      method: "OPTIONS", headers: { Origin: "https://customer.example", "Access-Control-Request-Method": "POST" },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(hasEndpointPreflight(path)).toBe(true);
  });
  it("keeps ordinary frontend and legacy control-plane routes unchanged", async () => {
    expect(await (await fetch(base + "/dashboard")).text()).toBe("Existing frontend");
    expect((await fetch(base + "/api/admin/status")).status).toBe(403);
    expect((await fetch(base + "/api/internal/status")).status).toBe(403);
    expect(resolvePlatformApi("/api/v10/projects").kind).toBe("unsupported");
    expect(resolvePlatformApi("/api/v01/projects").kind).toBe("unsupported");
  });
  it("publishes an accurate single-version catalog and migration documentation", async () => {
    const catalog = await (await fetch(base + "/api/versions")).json();
    expect(catalog.supportedVersions).toEqual(["v1"]);
    expect(catalog.retirementDate).toBeNull();
    expect(await (await fetch(base + "/api/v1/versions")).json()).toEqual(catalog);
    const response = await fetch(base + "/docs/api/versioning");
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("No new key or account is required");
    expect(html).toContain("require deployment of the updated Auth Worker");
    expect(html).toContain("updated Auth Worker");
    expect(response.headers.get("sunset")).toBeNull();
  });
  it("documents tenant v1 aliases with identical auth and request schemas", () => {
    const docs = authOpenApi();
    expect(docs.paths["/cf-auth/v1/t/{slug}/signup"]).toEqual(docs.paths["/cf-auth/t/{slug}/signup"]);
    expect(docs.paths["/cf-auth/v1/t/{slug}/sessions/{id}"]).toEqual(docs.paths["/cf-auth/t/{slug}/sessions/{id}"]);
  });
  it("does not version OAuth callbacks or silently alias platform login through tenant APIs", () => {
    expect(resolveAuthApi("/cf-auth/google/callback").kind).toBe("legacy");
    expect(resolveAuthApi("/cf-auth/v1/login").kind).toBe("unknown");
    expect(resolveAuthApi("/cf-auth/v1/run-code").kind).toBe("unknown");
    expect(resolveAuthApi("/cf-auth/v2/t/project/login").kind).toBe("unsupported");
  });
});
