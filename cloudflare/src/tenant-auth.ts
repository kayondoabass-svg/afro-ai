import { SignJWT, jwtVerify } from "jose";
import { parseTenantOrigins } from "../../shared/tenant-origins";

const issuer = "https://afroaigroup.com/cf-auth";
const now = () => Math.floor(Date.now() / 1000);
const enc = new TextEncoder();
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
function rawToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("");
}
type Dependencies = {
  hashPassword: (password: string) => Promise<string>;
  checkThrottles: (db: any, keys: string[], now: number) => Promise<number>;
  recordThrottleFailure: (db: any, key: string, now: number) => Promise<unknown>;
};

export function tenantAuth(deps: Dependencies) {
  async function tenant(c: any) {
    return c.env.DB.prepare("SELECT * FROM tenants WHERE slug = ? AND id != 'platform'").bind(c.req.param("slug")).first();
  }
  async function issue(c: any, tenantId: string, userId: string) {
    const id = crypto.randomUUID();
    const result = await c.env.DB.prepare(`INSERT INTO tenant_sessions (id,tenant_id,user_id,created_at,expires_at)
      SELECT ?,tenant_id,id,?,? FROM users WHERE id=? AND tenant_id=? AND email_verified=1`)
      .bind(id, now(), now() + 86400, userId, tenantId).run();
    if (!result.meta.changes) throw new Error("Verified tenant account required");
    return new SignJWT({ sub: userId, tid: tenantId, sid: id, kind: "afro_auth" })
      .setProtectedHeader({ alg: "HS256" }).setIssuer(issuer).setAudience(`afro-auth:${tenantId}`)
      .setIssuedAt().setExpirationTime("24h").sign(enc.encode(c.env.JWT_SECRET));
  }
  async function verify(c: any, token: string) {
    try {
      const { payload: p } = await jwtVerify(token, enc.encode(c.env.JWT_SECRET), {
        algorithms: ["HS256"], issuer, requiredClaims: ["exp", "iat", "sub", "sid", "tid", "kind", "aud"],
      });
      if (p.kind !== "afro_auth" || typeof p.tid !== "string" || p.aud !== `afro-auth:${p.tid}` || typeof p.sid !== "string") return null;
      const row = await c.env.DB.prepare(`SELECT s.id FROM tenant_sessions s JOIN users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id
        WHERE s.id=? AND s.tenant_id=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.email_verified=1`)
        .bind(p.sid, p.tid, p.sub, now()).first();
      return row ? { tenantId: p.tid, userId: p.sub as string, sessionId: p.sid } : null;
    } catch { return null; }
  }
  async function limited(c: any, t: any, action: string, email = "") {
    const keys = [`tenant:${t.id}:${action}:ip:${c.req.header("CF-Connecting-IP") || "unknown"}`,
      ...(email ? [`tenant:${t.id}:${action}:email:${email}`] : [])];
    if (await deps.checkThrottles(c.env.DB, keys, now())) return true;
    for (const key of keys) await deps.recordThrottleFailure(c.env.DB, key, now());
    return false;
  }
  async function mail(c: any, t: any, user: any, purpose: "verify" | "reset") {
    const raw = rawToken(), hash = await digest(raw);
    // One statement claims issuance before delivery; retries cannot flood mail.
    const result = await c.env.DB.prepare(`INSERT INTO tenant_auth_tokens (hash,tenant_id,user_id,purpose,expires_at,created_at)
      SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM tenant_auth_tokens WHERE tenant_id=? AND user_id=? AND purpose=? AND created_at>?)`)
      .bind(hash, t.id, user.id, purpose, now() + (purpose === "verify" ? 86400 : 3600), now(), t.id, user.id, purpose, now() - 60).run();
    if (!result.meta.changes) return;
    if (!c.env.RESEND_API_KEY) throw new Error("Email transport unavailable");
    const url = new URL(`/cf-auth/t/${encodeURIComponent(t.slug)}/${purpose === "verify" ? "verify-email" : "reset-password"}`, c.env.APP_URL);
    url.searchParams.set("token", raw);
    const action = purpose === "verify" ? "Confirm your email" : "Reset your password";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${c.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: c.env.MAIL_FROM || "Afro AI <noreply@afroaigroup.com>", to: user.email,
        subject: `${action} — ${t.name}`,
        text: `${action} for ${t.name}: ${url}. ${purpose === "verify" ? "Expires in 24 hours." : "Expires in one hour."}`,
        html: `<p>${escape(action)} for ${escape(t.name)}.</p><p><a href="${escape(url.toString())}">${escape(action)}</a></p><p>If you did not request this, ignore this email.</p>` }),
    });
    if (!response.ok) throw new Error("Email delivery failed");
  }
  async function actionRow(c: any, t: any, token: string, purpose: string) {
    return c.env.DB.prepare("SELECT * FROM tenant_auth_tokens WHERE hash=? AND tenant_id=? AND purpose=? AND used_at IS NULL AND expires_at>?")
      .bind(await digest(token), t.id, purpose, now()).first();
  }
  async function owned(c: any, t: any) {
    const session = await verify(c, (c.req.header("Authorization") || "").replace(/^Bearer /, ""));
    return session?.tenantId === t.id ? session : null;
  }
  function page(c: any, title: string, content: string) {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    return c.html(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>body{font:16px system-ui;max-width:460px;margin:10vh auto;padding:24px;background:#101014;color:#eee}input,button{box-sizing:border-box;width:100%;padding:12px;margin:10px 0}a{color:#facc15}button{cursor:pointer}</style></head><body><h1>${escape(title)}</h1>${content}</body></html>`);
  }
  function register(app: any) {
    for (const [path, purpose] of [["send-verification", "verify"], ["forgot-password", "reset"]] as const) {
      app.post(`/t/:slug/${path}`, async (c: any) => {
        const t = await tenant(c);
        if (!t) return c.json({ message: "Project not found." }, 404);
        const body = await c.req.json().catch(() => ({}));
        const email = String(body.email || "").trim().toLowerCase();
        if (await limited(c, t, purpose, email)) return c.json({ message: "Too many requests. Please wait." }, 429);
        const user = await c.env.DB.prepare("SELECT id,email,email_verified FROM users WHERE tenant_id=? AND email=?").bind(t.id, email).first();
        if (user && (purpose === "reset" || !user.email_verified)) {
          try { await mail(c, t, user, purpose); } catch { console.error("[tenant-auth] Email could not be delivered"); }
        }
        return c.json({ ok: true, message: "If eligible, an email will arrive shortly." });
      });
    }
    for (const purpose of ["verify", "reset"]) {
      const path = purpose === "verify" ? "verify-email" : "reset-password";
      app.get(`/t/:slug/${path}`, async (c: any) => {
        const t = await tenant(c);
        if (!t) return c.text("Project not found.", 404);
        const token = c.req.query("token") || "";
        const row = await actionRow(c, t, token, purpose);
        if (!row) return page(c, "Link unavailable", "<p>This link is invalid, expired, or already used. Request another link from the app.</p>");
        const fields = purpose === "reset" ? '<label>New password (at least 12 characters)<input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><label>Confirm password<input name="confirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label>' : "";
        return page(c, `${purpose === "verify" ? "Confirm email" : "Reset password"} — ${t.name}`,
          `<form method="post"><input type="hidden" name="token" value="${escape(token)}">${fields}<button>${purpose === "verify" ? "Confirm my email" : "Save new password"}</button></form>`);
      });
      app.post(`/t/:slug/${path}`, async (c: any) => {
        const t = await tenant(c);
        if (!t) return c.json({ message: "Project not found." }, 404);
        const form = !(c.req.header("Content-Type") || "").includes("application/json");
        const body = await (form ? c.req.parseBody() : c.req.json()).catch(() => ({}));
        const respond = (message: string, status = 200) => form ? (c.status(status), page(c, status === 200 ? "Completed" : "Unable to continue", `<p>${escape(message)}</p>`)) : c.json({ ok: status === 200, message }, status);
        if (await limited(c, t, `${purpose}-consume`)) return respond("Too many attempts. Please wait.", 429);
        const row = await actionRow(c, t, String(body.token || ""), purpose);
        if (!row) return respond("Invalid, expired, or already used link. Request a new link.", 400);
        const ts = now();
        const condition = "EXISTS (SELECT 1 FROM tenant_auth_tokens WHERE hash=? AND tenant_id=? AND used_at IS NULL AND expires_at>?)";
        let change: any;
        if (purpose === "reset") {
          const password = String(body.password || "");
          if (password.length < 12 || password.length > 128 || (form && password !== body.confirm)) return respond("Use 12–128 characters and matching passwords.", 400);
          change = c.env.DB.prepare(`UPDATE users SET password_hash=?,updated_at=? WHERE id=? AND tenant_id=? AND ${condition}`)
            .bind(await deps.hashPassword(password), ts, row.user_id, t.id, row.hash, t.id, ts);
        } else {
          change = c.env.DB.prepare(`UPDATE users SET email_verified=1,updated_at=? WHERE id=? AND tenant_id=? AND ${condition}`)
            .bind(ts, row.user_id, t.id, row.hash, t.id, ts);
        }
        const statements = [change];
        if (purpose === "reset") statements.push(c.env.DB.prepare(`UPDATE tenant_sessions SET revoked_at=? WHERE user_id=? AND tenant_id=? AND ${condition}`).bind(ts, row.user_id, t.id, row.hash, t.id, ts));
        statements.push(c.env.DB.prepare(`UPDATE tenant_auth_tokens SET used_at=? WHERE tenant_id=? AND user_id=? ${purpose === "verify" ? "AND purpose='verify'" : ""} AND used_at IS NULL AND ${condition}`)
          .bind(ts, t.id, row.user_id, row.hash, t.id, ts));
        const result = await c.env.DB.batch(statements);
        if (!result[0].meta.changes) return respond("Link already used or expired.", 400);
        return respond(purpose === "reset" ? "Password changed. All previous sessions are logged out. Return to your app and sign in." : "Email confirmed. Return to your app and sign in.");
      });
    }
    app.get("/t/:slug/sessions", async (c: any) => {
      const t = await tenant(c), s = t && await owned(c, t);
      if (!s) return c.json({ message: "Unauthorized." }, 401);
      const rows = await c.env.DB.prepare("SELECT id,created_at,expires_at FROM tenant_sessions WHERE tenant_id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?").bind(t.id, s.userId, now()).all();
      return c.json({ sessions: rows.results.map((r: any) => ({ ...r, current: r.id === s.sessionId })) });
    });
    for (const path of ["logout", "logout-all"]) app.post(`/t/:slug/${path}`, async (c: any) => {
      const t = await tenant(c), s = t && await owned(c, t);
      if (!s) return c.json({ message: "Unauthorized." }, 401);
      await c.env.DB.prepare(`UPDATE tenant_sessions SET revoked_at=? WHERE tenant_id=? AND user_id=?${path === "logout" ? " AND id=?" : ""}`)
        .bind(now(), t.id, s.userId, ...(path === "logout" ? [s.sessionId] : [])).run();
      return c.json({ ok: true });
    });
    app.delete("/t/:slug/sessions/:id", async (c: any) => {
      const t = await tenant(c), s = t && await owned(c, t);
      if (!s) return c.json({ message: "Unauthorized." }, 401);
      const result = await c.env.DB.prepare("UPDATE tenant_sessions SET revoked_at=? WHERE id=? AND tenant_id=? AND user_id=? AND revoked_at IS NULL")
        .bind(now(), c.req.param("id"), t.id, s.userId).run();
      return c.json({ ok: !!result.meta.changes }, result.meta.changes ? 200 : 404);
    });
    app.post("/t/:slug/oauth/exchange", async (c: any) => {
      const t = await tenant(c);
      if (!t) return c.json({ message: "Project not found." }, 404);
      if (await limited(c, t, "oauth-exchange")) return c.json({ message: "Too many attempts." }, 429);
      const body = await c.req.json().catch(() => ({}));
      const row = await actionRow(c, t, String(body.code || ""), "oauth");
      const verifier = String(body.code_verifier || "");
      if (!row || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return c.json({ message: "Invalid authorization code." }, 400);
      const context = JSON.parse(row.context);
      const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
      const challenge = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      if (challenge !== context.challenge || body.redirect_uri !== context.redirect) return c.json({ message: "Invalid authorization code." }, 400);
      const result = await c.env.DB.prepare("UPDATE tenant_auth_tokens SET used_at=? WHERE hash=? AND used_at IS NULL AND expires_at>?").bind(now(), row.hash, now()).run();
      if (!result.meta.changes) return c.json({ message: "Authorization code already used." }, 400);
      return c.json({ token: await issue(c, t.id, row.user_id) });
    });
  }
  async function oauthTarget(c: any, tenantId: string) {
    const t = await c.env.DB.prepare("SELECT allowed_origins FROM tenants WHERE id=? AND id!='platform'").bind(tenantId).first();
    const redirect = c.req.query("redirect_uri") || "";
    try {
      const u = new URL(redirect);
      if (!t || u.hash || u.username || u.password || !parseTenantOrigins(t.allowed_origins).includes(u.origin) ||
        !/^[A-Za-z0-9_-]{43}$/.test(c.req.query("code_challenge") || "")) return null;
      return redirect;
    } catch { return null; }
  }
  async function finishOAuth(c: any, state: any, userId: string) {
    const t = await c.env.DB.prepare("SELECT allowed_origins FROM tenants WHERE id=?").bind(state.tenantId).first();
    if (!t || !parseTenantOrigins(t.allowed_origins).includes(new URL(state.redirect).origin) || !state.challenge) return c.text("OAuth configuration changed. Start again.", 400);
    const raw = rawToken();
    await c.env.DB.prepare("INSERT INTO tenant_auth_tokens (hash,tenant_id,user_id,purpose,expires_at,context,created_at) VALUES (?,?,?,'oauth',?,?,?)")
      .bind(await digest(raw), state.tenantId, userId, now() + 60, JSON.stringify({ redirect: state.redirect, challenge: state.challenge }), now()).run();
    const url = new URL(state.redirect);
    url.searchParams.set("code", raw);
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    return c.redirect(url.toString());
  }
  return { issue, verify, mail, register, oauthTarget, finishOAuth };
}