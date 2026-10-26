// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import worker from "../../cloudflare/src/index";
import { handleVersionedAuthRequest } from "../../cloudflare/src/api-versioning";

describe("Afro Auth v1 compatibility", () => {
  it("normalises tenant signup before dispatch without losing a body, query or credentials", async () => {
    const dispatch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/cf-auth/t/project/signup");
      expect(new URL(request.url).search).toBe("?return=%2Fhome");
      expect(request.headers.get("authorization")).toBe("Bearer test-only");
      expect(request.headers.get("origin")).toBe("https://customer.example");
      expect(await request.json()).toEqual({ email: "user@example.test", password: "test-only-password" });
      return new Response(JSON.stringify({ message: "Check your email" }), {
        status: 201, headers: { "Content-Type": "application/json", "Set-Cookie": "test=only; HttpOnly" },
      });
    });
    const response = await handleVersionedAuthRequest(new Request("https://platform.example/cf-auth/v1/t/project/signup?return=%2Fhome", {
      method: "POST", headers: { Authorization: "Bearer test-only", Origin: "https://customer.example", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.test", password: "test-only-password" }),
    }), dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(response.headers.get("x-afro-api-version")).toBe("v1");
    expect(response.headers.get("set-cookie")).toBe("test=only; HttpOnly");
    expect(await response.json()).toEqual({ message: "Check your email" });
  });
  it("leaves management paths and redirects untouched, preserving location and multiple cookies", async () => {
    const request = new Request("https://platform.example/cf-auth/v1/sessions/verify", {
      method: "POST", body: '{"token":"test-only"}',
    });
    const headers = new Headers({ Location: "/continue" });
    headers.append("Set-Cookie", "first=test; HttpOnly");
    headers.append("Set-Cookie", "second=test; HttpOnly");
    const response = await handleVersionedAuthRequest(request, async routed => {
      expect(routed).toBe(request);
      return new Response(null, { status: 302, headers });
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/continue");
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });
  it.each(["/cf-auth/v2/t/project/signup", "/cf-auth/v1/login", "/cf-auth/v1/run-code"])(
    "rejects %s without calling the Worker handler", async path => {
      const dispatch = vi.fn();
      const response = await handleVersionedAuthRequest(new Request("https://platform.example" + path), dispatch);
      expect(response.status).toBe(404);
      expect(dispatch).not.toHaveBeenCalled();
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );
  it.each(["/cf-auth/t/project/signup", "/cf-auth/v1/t/project/signup"])(
    "enforces the real tenant origin allowlist, rather than permissive management CORS at %s", async path => {
      const first = vi.fn(async () => ({ allowed_origins: '["https://customer.example"]' }));
      const DB = { prepare: vi.fn(() => ({ bind: () => ({ first }) })) };
      const env = { APP_URL: "https://platform.example", DB } as any;
      const context = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
      const allowed = await worker.fetch(new Request("https://platform.example" + path, {
        method: "OPTIONS", headers: { Origin: "https://customer.example" },
      }), env, context);
      expect(allowed.status).toBe(204);
      expect(allowed.headers.get("access-control-allow-origin")).toBe("https://customer.example");
      const denied = await worker.fetch(new Request("https://platform.example" + path, {
        method: "OPTIONS", headers: { Origin: "https://attacker.example" },
      }), env, context);
      expect(denied.status).toBe(403);
      expect(denied.headers.get("access-control-allow-origin")).toBeNull();
      expect(await denied.json()).toEqual({ message: "Origin is not allowed for this project." });
      for (const [sql] of DB.prepare.mock.calls) expect(sql).toContain("WHERE slug = ?");
    },
  );
});
