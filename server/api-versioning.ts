import type { Express, RequestHandler } from "express";
import {
  API_ALIASES, API_VERSION, API_VERSION_HEADER, hasEndpointPreflight, resolvePlatformApi, versionError,
} from "@shared/api-version-policy";

export const apiVersioning: RequestHandler = (req, res, next) => {
  const result = resolvePlatformApi(req.path);
  if (result.kind === "unsupported" || result.kind === "unknown") {
    return res.status(404).json(versionError(result));
  }
  if (result.version) {
    res.setHeader(API_VERSION_HEADER, result.version);
    res.append("Access-Control-Expose-Headers", API_VERSION_HEADER);
  }
  if (result.kind === "supported") {
    res.locals.explicitApiVersion = API_VERSION;
    // Preserve originalUrl for tracing. Never redirect or issue a second HTTP
    // request: POST bodies, raw webhook bytes, cookies and auth headers survive.
    const queryAt = req.url.indexOf("?");
    req.url = result.target + (queryAt < 0 ? "" : req.url.slice(queryAt));
    if (req.method === "OPTIONS" && !hasEndpointPreflight(req.path)) return res.sendStatus(204);
  }
  next();
};

export const versionedApiNotFound: RequestHandler = (_req, res, next) => {
  if (!res.locals.explicitApiVersion) return next();
  res.status(404).json(versionError({ kind: "unknown", version: API_VERSION }));
};

export function apiVersionCatalog() {
  return {
    supportedVersions: [API_VERSION],
    latestVersion: API_VERSION,
    legacyRoutes: "supported",
    retirementDate: null,
    documentation: "/docs/api/versioning",
    routes: API_ALIASES.map(a => ({
      name: a.label, versionedPrefix: `/api/v1/${a.versioned}`,
      legacyPrefix: `/api/${a.legacy}`,
    })),
    existingVersionedEndpoints: [
      "/api/v1/chatbot/message", "/cf-auth/v1/sessions/verify",
      "/cf-auth/v1/users", "/cf-auth/v1/admin/tenants",
    ],
    authTenantPrefix: {
      versioned: "/cf-auth/v1/t/:slug",
      legacy: "/cf-auth/t/:slug",
      deployment: "Requires the updated Afro Auth Worker",
    },
  };
}

export function registerApiVersionDocs(app: Express) {
  app.get("/api/versions", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(apiVersionCatalog());
  });
  app.get("/docs/api/versioning", (_req, res) => {
    res.type("html").send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Afro AI API versioning</title><style>
body{font:16px/1.6 system-ui,sans-serif;max-width:960px;margin:32px auto;padding:0 20px;color:#202020}
h1,h2{line-height:1.25}code{background:#f0f0f0;padding:2px 5px;overflow-wrap:anywhere}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}
.scroll{overflow-x:auto}a{color:#805400}
</style></head><body><nav><a href="/">Afro AI</a> · <a href="/docs/auth">Afro Auth docs</a> ·
<a href="/api/versions">Version catalog (JSON)</a></nav>
<h1>API versioning</h1><p><strong>v1 is the only supported major API version.</strong>
Existing unversioned URLs remain supported. No retirement date has been set.</p>
<h2>Choose a version using the URL</h2><p>For example, use <code>POST /api/v1/email/send</code>
instead of <code>POST /api/email-api/send</code>. Both currently call the same handler and preserve
request fields, response fields, status codes, authentication and quotas. Do not send both requests:
that could send the email twice. No new key or account is required.</p>
<p>Recognised routes return <code>${API_VERSION_HEADER}: v1</code>. This header identifies the
contract; it does not select a version. An unsupported numeric version such as
<code>/api/v2/email/send</code> returns HTTP 404 with <code>UNSUPPORTED_API_VERSION</code>.
An unknown v1 endpoint returns HTTP 404 with <code>VERSIONED_ENDPOINT_NOT_FOUND</code>.</p>
<h2>Versioned route families</h2><p>Suffixes and existing HTTP methods remain unchanged.
A prefix is not a promise that every possible suffix or method exists. Management routes still require
their existing dashboard session; an alias does not make them a public API-key endpoint.</p>
<div class="scroll"><table><thead><tr><th>Product</th><th>v1 prefix</th><th>Existing prefix</th></tr></thead><tbody>
${API_ALIASES.map(a => `<tr><td>${a.label}</td><td><code>/api/v1/${a.versioned}</code></td><td><code>/api/${a.legacy}</code></td></tr>`).join("")}
</tbody></table></div>
<h2>Existing chatbot and Auth APIs</h2><p><code>POST /api/v1/chatbot/message</code> remains
unchanged. Afro Auth management remains under <code>/cf-auth/v1/</code>.
Customer login, signup, session and recovery operations gain
<code>/cf-auth/v1/t/:slug/...</code> aliases for <code>/cf-auth/t/:slug/...</code>.
These aliases require deployment of the updated Auth Worker. Origin allowlists, tokens and
email verification requirements are unchanged. See <a href="/openapi.json">Afro Auth OpenAPI</a>.</p>
<h2>Compatibility policy</h2><p>Within v1, preserve required inputs, field names and types,
status-code meanings and documented behaviour. Breaking changes require an explicitly introduced
new major version and migration guide. Compatible additions and bug fixes may remain in v1.
Security fixes must not be delayed to preserve unsafe behaviour.</p>
<h2>Widgets, callbacks, webhooks and MCP</h2><p>Existing <code>/widget.js</code> installs,
OAuth callback URLs and provider webhook URLs are unchanged. Existing webhook payloads are unchanged;
this release does not introduce webhook-version selection. SDKs and future MCP tools should explicitly
pin their underlying API contract. SDK package versions and MCP protocol versions are separate
from Afro AI API versions.</p>
<h2>Migration and future retirement</h2><ol><li>Test a documented v1 URL with your existing request.</li>
<li>Update your integration's URL only; keep its current keys and request/response handling.</li>
<li>Do not retry paid or destructive operations through a second URL after an ambiguous failure.</li>
</ol><p>There is no v2 and no automatic switch to another version. Before any future retirement,
publish migration instructions, notify affected customers, announce the date and add appropriate
deprecation headers. No deprecation or Sunset header is being sent today.</p>
</body></html>`);
  });
}
