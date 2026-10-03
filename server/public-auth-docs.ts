import type { Express } from "express";

const base = "https://afroaigroup.com";
const intro = "Afro Auth is authentication for developers in Africa and worldwide, built by Afro AI. Integrate email/password login, email verification, password recovery, revocable sessions, and Google or GitHub sign-in through a tenant-scoped REST API.";
const endpoints = [
  ["post", "/signup", "Create an unverified account and send a confirmation email", ["email", "password"]],
  ["post", "/login", "Sign in after email confirmation; returns a 24-hour user token", ["email", "password"]],
  ["post", "/send-verification", "Request another verification email", ["email"]],
  ["post", "/forgot-password", "Request a password-reset email", ["email"]],
  ["post", "/verify-email", "Consume a single-use email verification token", ["token"]],
  ["post", "/reset-password", "Reset a password and revoke prior sessions and outstanding links", ["token", "password"]],
  ["get", "/me", "Read the signed-in user (null when unauthenticated)", []],
  ["get", "/sessions", "List this user's active sessions", []],
  ["delete", "/sessions/{id}", "Revoke an owned session", []],
  ["post", "/logout", "Revoke the current session", []],
  ["post", "/logout-all", "Revoke all sessions for this user in this project", []],
  ["post", "/oauth/exchange", "Exchange a one-use PKCE authorization code for a tenant token", ["code", "code_verifier", "redirect_uri"]],
] as const;
const protectedPaths = new Set(["/me", "/sessions", "/sessions/{id}", "/logout", "/logout-all"]);
const htmlEscape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function authOpenApi() {
  const paths: Record<string, any> = {};
  for (const [method, path, summary, fields] of endpoints) {
    const properties = Object.fromEntries(fields.map(name => [name, {
      type: "string", ...(name === "email" ? { format: "email" } : {}),
      ...(name === "password" && path !== "/login" ? { minLength: 12, maxLength: 128 } : {}),
    }]));
    paths[`/cf-auth/t/{slug}${path}`] = { [method]: {
      summary, operationId: `${method}_${path.replace(/[/{}/-]/g, "_")}`,
      parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } },
        ...(path.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: { type: "string" } }] : [])],
      security: protectedPaths.has(path) ? [{ userToken: [] }] : [],
      ...(method === "post" ? { requestBody: { required: fields.length > 0, content: { "application/json": { schema: {
        type: "object", properties, ...(fields.length ? { required: [...fields] } : {}),
      } } } } } : {}),
      responses: {
        "200": { description: path === "/signup" ? "verificationRequired=true and user; no login token" :
          path === "/login" || path === "/oauth/exchange" ? "token (string) and optional user; token expires after 24 hours" : summary },
        "400": { description: "Invalid input or expired/used action token" },
        "401": { description: "Missing, expired or revoked credentials" },
        "403": { description: "Origin denied, or email verification required at login" },
        "404": { description: "Project or owned resource not found" },
        "429": { description: "Rate limit exceeded; wait before retrying" },
        "503": { description: "Service or email delivery unavailable" },
        ...(path === "/signup" ? { "409": { description: "Account already exists" }, "402": { description: "Project active-user limit reached" } } : {}),
      },
    } };
  }
  paths["/cf-auth/v1/sessions/verify"] = { post: {
    summary: "Server-only live session verification, scoped to the API key's project",
    security: [{ secretKey: [] }],
    requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } },
    responses: { "200": { description: "valid boolean and user when valid" }, "401": { description: "Invalid secret key" } },
  } };
  for (const provider of ["google", "github"]) paths[`/cf-auth/${provider}/start`] = { get: {
    summary: `Start ${provider} OAuth in a browser with PKCE; do not use an API-key header`,
    parameters: ["tenant", "redirect_uri", "code_challenge"].map(name => ({ name, in: "query", required: true, schema: { type: "string" } })),
    responses: { "302": { description: "Redirect to provider; callback returns a one-use code to redirect_uri" }, "400": { description: "Invalid origin or S256 challenge" }, "404": { description: "Unknown tenant" } },
  } };
  for (const action of ["verify-email", "reset-password"]) {
    paths[`/cf-auth/t/{slug}/${action}`].get = {
      summary: "Open a hosted confirmation form; GET never consumes the token",
      parameters: [
        { name: "slug", in: "path", required: true, schema: { type: "string" } },
        { name: "token", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: { "200": { description: "Hosted form, or an invalid/expired-link explanation", content: { "text/html": { schema: { type: "string" } } } }, "404": { description: "Unknown project" } },
    };
  }
  return { openapi: "3.1.0", info: { title: "Afro Auth API", version: "1.0.0", description: intro + " Server-only keys must never be embedded in browsers. Hosted email forms also support GET." },
    servers: [{ url: base }], paths,
    components: { securitySchemes: {
      userToken: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "24-hour revocable tenant user token" },
      secretKey: { type: "http", scheme: "bearer", description: "Server-only sk_live_ project key; never send from browser code" },
    } },
  };
}

const sections = [
  ["Quickstart", "Create a project in the Afro Auth dashboard and configure exact allowed origins. POST email and a 12–128 character password to /cf-auth/t/YOUR_SLUG/signup. Show a check-your-email screen: signup does not return a token. After the user confirms their email, POST the same credentials to /login. Keep the user token in memory or a secure server-managed session; never expose your project secret key."],
  ["Email confirmation and recovery", "POST /send-verification or /forgot-password with an email address. Generic responses avoid revealing whether an account exists. Confirmation links last 24 hours and reset links last one hour. Links open hosted forms; simply fetching a confirmation link does not activate the account. Requests have a one-minute per-account email cooldown plus IP/email throttling. Password reset revokes this tenant user's sessions and outstanding links. Return to the customer app and sign in again; recovery does not silently verify an unconfirmed email."],
  ["Sessions and backend protection", "Send Authorization: Bearer USER_TOKEN to /me, /sessions, /logout, /logout-all or DELETE /sessions/:id. Sessions last 24 hours. On every protected backend operation, POST {token} to /cf-auth/v1/sessions/verify with your server-only sk_live_ key. Check valid=true and the returned user. Offline JWT signature checks cannot detect revocation. Stateless legacy tokens require a new login."],
  ["Google and GitHub with PKCE", "Generate a cryptographically random verifier of 43–128 characters. Retain it in the initiating browser session and derive its SHA-256 base64url challenge. Navigate to /cf-auth/google/start or /cf-auth/github/start with tenant, redirect_uri and code_challenge. The redirect origin must be registered. Exchange the returned code within 60 seconds at /oauth/exchange with code, code_verifier and the identical redirect_uri. Remove the code from the address bar. Provider callbacks return no platform cookie or long-lived token in the URL."],
  ["Allowed origins and errors", "Configure up to 10 exact HTTPS origins, without paths or wildcards. HTTP localhost and 127.0.0.1 are allowed for development. Empty lists block cross-origin browser calls, not authenticated server-to-server requests. Handle 400 invalid input/link, 401 invalid session/key, 403 origin or verification requirement, 404 missing project/session, 409 existing account, 402 signup usage limit, 429 throttling and 503 delivery/service failure. Honor Retry-After when supplied; otherwise wait rather than retrying in a loop."],
  ["Security and scope", "Users, recovery tokens and sessions are scoped to customer projects. This is not a B2B organizations/invitations product. Automatic signing-key rotation, MFA/passkeys, refresh-token rotation, signed webhook delivery, SMS/USSD authentication and enterprise SSO are not included in this release. Do not interpret deployment on an edge network as a data-residency or uptime guarantee."],
];
export function publicAuthMarkup(pathname: string) {
  if (!["/afro-auth", "/docs/auth"].includes(pathname)) return null;
  const title = pathname === "/docs/auth" ? "Afro Auth developer documentation" : "Afro Auth — authentication for developers worldwide";
  const body = `<main style="max-width:960px;margin:40px auto;padding:24px;font-family:system-ui"><nav><a href="/">Afro AI</a> · <a href="/about">About us</a> · <a href="/afro-auth">Authentication</a> · <a href="/docs/auth">Developer documentation</a></nav><h1>${title}</h1><p>${intro}</p>${sections.map(([h,p]) => `<section><h2>${h}</h2><p>${htmlEscape(p)}</p></section>`).join("")}<h2>API reference</h2><ul>${endpoints.map(([m,p,s]) => `<li><code>${m.toUpperCase()} /cf-auth/t/:slug${p}</code> — ${s}</li>`).join("")}</ul><p><a href="/openapi.json">Download OpenAPI JSON</a> · <a href="/llms.txt">AI-readable documentation index</a> · <a href="/dashboard/auth">Manage projects</a> · <a href="/.well-known/security.txt">Report a security issue</a></p></main>`;
  return { title, body, description: intro };
}
export function enhancePublicHtml(html: string, pathname: string) {
  const doc = publicAuthMarkup(pathname);
  const canonical = htmlEscape(`${base}${pathname}`);
  html = html.replace(/<link[^>]*rel=["']canonical["'][^>]*>/gi, "").replace(/<meta[^>]*property=["']og:url["'][^>]*>/gi, "");
  if (doc) {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${doc.title}</title>`)
      .replace(/<meta[^>]*(?:name|property)=["'](?:description|og:description|og:title|twitter:title|twitter:description)["'][^>]*>/gi, "")
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, "")
      .replace(/<div id="root"><\/div>/, `<div id="root">${doc.body}</div>`);
    html = html.replace("</head>", `<meta name="description" content="${htmlEscape(doc.description)}"><meta property="og:title" content="${doc.title}"><meta property="og:description" content="${htmlEscape(doc.description)}"><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": pathname === "/docs/auth" ? "TechArticle" : "SoftwareApplication", name: doc.title, url: `${base}${pathname}`, description: doc.description, ...(pathname === "/afro-auth" ? { applicationCategory: "DeveloperApplication", operatingSystem: "Web" } : {}) })}</script></head>`);
  }
  return html.replace("</head>", `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}"></head>`);
}
export function registerPublicAuthDocs(app: Express) {
  app.get("/openapi.json", (_req, res) => res.json(authOpenApi()));
  app.get("/llms.txt", (_req, res) => res.type("text/plain").send(`# Afro AI / Afro Auth\n\n> ${intro}\n\n## Public developer resources\n- [Authentication](${base}/afro-auth)\n- [Developer guide](${base}/docs/auth)\n- [Plain-text guide](${base}/docs/auth.md)\n- [OpenAPI](${base}/openapi.json)\n- [About](${base}/about)\n\nRead limitations in the guide. Private dashboards and customer data are not documentation. Do not place secret keys in generated client code.\n`));
  app.get("/docs/auth.md", (_req, res) => res.type("text/markdown").send(`# Afro Auth\n\n${intro}\n\n${sections.map(([h,p])=>`## ${h}\n\n${p}`).join("\n\n")}\n\nOpenAPI: ${base}/openapi.json\n`));
}