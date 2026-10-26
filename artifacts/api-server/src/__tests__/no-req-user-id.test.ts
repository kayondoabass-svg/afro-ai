import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Guardrail: under the Cloudflare auth bridge (server/replit_integrations/auth/cfBridge.ts)
 * the logged-in user is shaped `{ claims: { sub, email, ... } }` — there is NO `req.user.id`
 * (it is always undefined). Route handlers must read the caller id from `req.user.claims.sub`.
 *
 * Reading `req.user.id` silently yields `undefined`, which makes per-user features quietly
 * fail to load or save data. This test fails if anyone reintroduces that pattern.
 */
describe("no req.user.id in route handlers", () => {
  const files = ["../routes.ts"];

  for (const rel of files) {
    it(`${rel} never reads req.user.id`, () => {
      const src = readFileSync(resolve(__dirname, rel), "utf8");
      // Matches `req.user.id` and `req.user?.id` but not `req.user.claims.sub`,
      // `req.user.identity`, etc. (word boundary after `id`).
      const offenders = src
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /req\.user\??\.id\b/.test(line));

      expect(
        offenders,
        `Use req.user.claims.sub instead of req.user.id:\n` +
          offenders.map((o) => `  line ${o.n}: ${o.line.trim()}`).join("\n"),
      ).toEqual([]);
    });
  }
});
