// Exercise the real workerd fetch implementation, not Node's fetch mock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const { outputFiles } = await build({
  stdin: {
    contents: `
      import { platformAdminIdentity } from './src/platform-admin-auth';
      export default { async fetch(request) {
        const headers = new Headers();
        const c = {
          req: { header: name => request.headers.get(name) },
          env: {
            APP_URL: 'https://platform.example',
            DB: { prepare: () => ({ bind: () => ({ all: async () => ({results: []}) }) }) }
          },
          header: (key, value) => headers.set(key, value),
          json: (body, status) => Response.json(body, {status, headers})
        };
        const result = await platformAdminIdentity(c);
        return result instanceof Response ? result : Response.json(result);
      }};
    `,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
  },
  bundle: true, write: false, format: "esm", platform: "browser",
});

for (const [name, upstreamStatus, expectedStatus] of [
  ["valid dashboard session reaches the identity server", 200, 200],
  ["expired sessions return 401 instead of a runtime failure", 401, 401],
  ["redirects fail closed without forwarding credentials", 302, 503],
  ["upstream failures remain unavailable", 500, 503],
]) {
  test(name, async () => {
    let calls = 0;
    const mf = new Miniflare({
      modules: true,
      compatibilityDate: "2025-04-01",
      script: outputFiles[0].text,
      outboundService: async request => {
        calls++;
        assert.equal(request.url, "https://platform.example/api/auth/user");
        assert.equal(request.headers.get("cookie"), "connect.sid=test-only");
        return new Response(JSON.stringify({
          id: "platform-user", email: "user@example.test", emailVerified: true,
        }), {
          status: upstreamStatus,
          headers: { "Content-Type": "application/json", Location: "https://other.example/" },
        });
      },
    });
    try {
      const response = await mf.dispatchFetch("https://worker.example/", {
        headers: { Cookie: "connect.sid=test-only" },
      });
      assert.equal(response.status, expectedStatus);
      assert.equal(calls, 1);
      if (upstreamStatus === 200) assert.equal((await response.json()).id, "platform-user");
    } finally {
      await mf.dispose();
    }
  });
}