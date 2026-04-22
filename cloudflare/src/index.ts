/**
 * Afro AI authentication Worker
 *
 * Endpoints (Pass 1 — email + password + Turnstile + JWT cookie):
 *   POST /api/auth/signup            { email, password, firstName?, lastName?, turnstileToken }
 *   POST /api/auth/login             { email, password, turnstileToken }
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *   POST /api/auth/forgot-password   { email }
 *   POST /api/auth/reset-password    { token, password }
 *   GET  /health
 *
 * OAuth (Google / GitHub / TikTok) lives in Pass 2.
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

interface Env {
  DB: D1Database;
  APP_URL: string;
  COOKIE_DOMAIN: string;
  JWT_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  // INTERNAL_EMAIL_SECRET still gates the admin /mint-reset-token endpoint
  // (shared secret with the migration blast script). EXPRESS_BASE_URL is no
  // longer used for mail — kept optional for backwards compat.
  INTERNAL_EMAIL_SECRET?: string;
  EXPRESS_BASE_URL?: string;
  // Outbound transactional mail goes through Resend (https://resend.com)
  // directly from the Worker. RESEND_API_KEY is the Bearer token; MAIL_FROM
  // is the verified sender address.
  RESEND_API_KEY?: string;
  MAIL_FROM?: string; // e.g. "Afro AI <noreply@afroaigroup.com>"
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

// All routes live under /cf-auth/* so the Worker can sit on a Cloudflare Route
// like `afroaigroup.com/cf-auth/*`, side-by-side with the existing Express app
// (which keeps owning /api/*). This makes the session cookie a first-party cookie,
// which works on iOS Safari and avoids every CORS / third-party-cookie problem.
const root = new Hono<{ Bindings: Env }>();
const app = root.basePath('/cf-auth');
const enc = new TextEncoder();

/* ------------------------------ CORS ------------------------------ */
app.use('/*', async (c, next) => {
  const origin = c.req.header('Origin');
  const host = c.env.APP_URL.replace(/^https?:\/\//, '');
  const allowed = new Set([
    c.env.APP_URL,
    `https://www.${host}`,
    `https://${host}`,
  ]);
  if (origin && allowed.has(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');
    c.header('Vary', 'Origin');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});

/* ------------------------------ Helpers ------------------------------ */

function uuid(): string {
  return crypto.randomUUID();
}
function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Hash a password using PBKDF2-SHA256 (works in Workers, no native deps). */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    km,
    256,
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return `pbkdf2$200000$${saltB64}$${hashB64}`;
}

/**
 * Verify a password against a stored hash. Supports two formats:
 *
 *   1. `pbkdf2$…` — native Worker hashes (preferred going forward).
 *   2. `$2a$…` / `$2b$…` / `$2y$…` — bcrypt hashes carried over from the
 *      legacy Express stack so existing users keep logging in with their
 *      current password without any reset email blast.
 *
 * The login route silently re-hashes bcrypt verifications to PBKDF2 on
 * success so the legacy format is gradually retired with zero user impact.
 */
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    try {
      return await bcrypt.compare(password, stored);
    } catch {
      return false;
    }
  }
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const salt = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const expectedB64 = parts[3];
  const km = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    km,
    256,
  );
  const actualB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  // Fixed-length constant-time compare. Both values are PBKDF2-SHA256 base64
  // outputs, so they're always 44 chars; we still iterate a fixed length to
  // avoid leaking timing information if `stored` is malformed.
  const len = Math.max(actualB64.length, expectedB64.length);
  let diff = actualB64.length ^ expectedB64.length;
  for (let i = 0; i < len; i++) {
    const a = i < actualB64.length ? actualB64.charCodeAt(i) : 0;
    const b = i < expectedB64.length ? expectedB64.charCodeAt(i) : 0;
    diff |= a ^ b;
  }
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(token: string, secret: string, ip?: string): Promise<boolean> {
  if (!token || !secret) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}

/** Build the JWT payload for a session cookie. Includes a small set of public
 *  user fields so the Express bridge on the Replit side can verify and trust
 *  the session without an extra D1 lookup. */
async function buildSessionClaims(c: any, userId: string): Promise<Record<string, any>> {
  const row = await c.env.DB.prepare(
    'SELECT email, first_name AS firstName, last_name AS lastName, profile_image_url AS profileImageUrl FROM users WHERE id = ?',
  )
    .bind(userId)
    .first<{ email: string; firstName?: string; lastName?: string; profileImageUrl?: string }>();
  return {
    sub: userId,
    email: row?.email || '',
    first_name: row?.firstName || '',
    last_name: row?.lastName || '',
    profile_image_url: row?.profileImageUrl || '',
  };
}

async function issueSession(c: any, userId: string) {
  const secret = enc.encode(c.env.JWT_SECRET);
  const claims = await buildSessionClaims(c, userId);
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
  // Intentionally host-only (no `domain` attribute). A broad `.afroaigroup.com`
  // cookie would be sent to ANY subdomain — including untrusted or future
  // user-published subdomains — which is a session-hijack vector. The cookie
  // is only valid on the exact origin that issued it (afroaigroup.com).
  setCookie(c, 'afroai_session', token, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 30,
  });
}

async function getCurrentUserId(c: any): Promise<string | null> {
  const token = getCookie(c, 'afroai_session');
  if (!token) return null;
  try {
    const secret = enc.encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return (payload.sub as string) || null;
  } catch {
    return null;
  }
}

/* ------------------------------ Outbound email ------------------------------
 *
 * Transactional mail (password reset, set-password) is sent directly from
 * the Worker via Resend (https://api.resend.com/emails).
 *
 * Auth is a Bearer API key set as a Worker secret (RESEND_API_KEY). The
 * sending domain (afroaigroup.com) must be verified in Resend with the
 * SPF/DKIM/DMARC DNS records they provide.
 *
 * Templates live inline here (small, transactional, rarely change). If we
 * ever need richer templates we can lift them into a templates module.
 */
const BRAND_COLOR = '#facc15';
const FALLBACK_FROM = 'Afro AI <noreply@afroaigroup.com>';

function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#e5e5e5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<h1 style="color:${BRAND_COLOR};font-size:22px;margin:0 0 18px;">Afro AI</h1>
${bodyHtml}
<p style="font-size:12px;color:#71717a;margin-top:32px;border-top:1px solid #27272a;padding-top:16px;">
Afro AI · Built for Africa · <a href="https://afroaigroup.com" style="color:${BRAND_COLOR};">afroaigroup.com</a>
</p></div></body></html>`;
}

function renderTemplate(
  template: 'password_reset' | 'set_password',
  vars: Record<string, string>,
): { subject: string; html: string; text: string } {
  const name = vars.name || 'there';
  const resetUrl = vars.resetUrl || '';
  if (template === 'set_password') {
    const subject = 'Set your Afro AI password';
    const body = `<p>Hi ${name},</p>
<p>We've upgraded the way you sign in to Afro AI. Your existing account is still here — just choose a password to keep using it. Tap the button below to set one. The link works for the next <strong>60 minutes</strong> and can only be used once.</p>
<p style="margin:24px 0;text-align:center;"><a href="${resetUrl}" style="background:${BRAND_COLOR};color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Set my password →</a></p>
<p style="font-size:13px;color:#a1a1aa;">If the button doesn't work, copy this link into your browser:<br/><span style="word-break:break-all;color:${BRAND_COLOR};">${resetUrl}</span></p>
<p style="font-size:13px;color:#a1a1aa;margin-top:18px;">If you don't recognise this account, you can safely ignore this email.</p>`;
    const text = `Hi ${name},\n\nSet your Afro AI password using this one-time link (works for 60 minutes):\n${resetUrl}\n\nIf you don't recognise this account, just ignore the email.`;
    return { subject, html: emailShell(subject, body), text };
  }
  const subject = 'Reset your Afro AI password';
  const body = `<p>Hi ${name},</p>
<p>We got a request to reset the password on your Afro AI account. Tap the button below to set a new one. The link works for the next <strong>60 minutes</strong> and can only be used once.</p>
<p style="margin:24px 0;text-align:center;"><a href="${resetUrl}" style="background:${BRAND_COLOR};color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reset my password →</a></p>
<p style="font-size:13px;color:#a1a1aa;">If the button doesn't work, copy this link into your browser:<br/><span style="word-break:break-all;color:${BRAND_COLOR};">${resetUrl}</span></p>
<p style="font-size:13px;color:#a1a1aa;margin-top:18px;">Didn't ask to reset your password? You can safely ignore this email — your account stays the same.</p>`;
  const text = `Hi ${name},\n\nReset your Afro AI password using this link (works for 60 minutes):\n${resetUrl}\n\nIf you didn't ask for this, just ignore the email.`;
  return { subject, html: emailShell(subject, body), text };
}

function parseFrom(raw: string): { email: string; name?: string } {
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2] };
  return { email: raw.trim() };
}

async function sendViaBridge(
  env: Env,
  template: 'password_reset' | 'set_password',
  to: string,
  vars: Record<string, string>,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.error('[resend] RESEND_API_KEY not set — cannot send', template, 'to', to);
    return;
  }
  const from = env.MAIL_FROM || FALLBACK_FROM;
  const { subject, html, text } = renderTemplate(template, vars);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[resend] send failed', res.status, body.slice(0, 500));
    return;
  }
}

/* ------------------------------ Throttling ------------------------------
 *
 * Server-side rate limiter that backs Turnstile on the abuse-sensitive
 * endpoints (/login, /signup, /forgot-password). Turnstile alone isn't enough
 * — a CAPTCHA-farm or single-solve-then-replay attacker can still brute-force
 * passwords or spam reset emails. We keep one row per "throttle key" in D1
 * (e.g. "login:ip:1.2.3.4" or "login:email:foo@bar.com") and lock the key
 * for a cool-off period once too many failures land inside a rolling window.
 *
 * Defaults: 5 failures / 15 min → 30 min lock, applied per-IP AND per-email
 * so a single bad actor can't pivot across either axis.
 */
const THROTTLE_WINDOW_SEC = 15 * 60;
const THROTTLE_MAX_ATTEMPTS = 5;
const THROTTLE_LOCK_SEC = 30 * 60;

interface ThrottleRow {
  count: number;
  window_start: number;
  locked_until: number | null;
}

/** Returns >0 retry-after if the key is currently locked, else 0. */
async function throttleRetryAfter(
  db: D1Database,
  key: string,
  now: number,
): Promise<number> {
  const row = await db
    .prepare('SELECT count, window_start, locked_until FROM auth_throttle WHERE key = ?')
    .bind(key)
    .first<ThrottleRow>();
  if (!row || !row.locked_until) return 0;
  if (row.locked_until <= now) return 0;
  return row.locked_until - now;
}

/** Check a list of keys; return the longest retry-after, or 0 if none locked. */
async function checkThrottles(
  db: D1Database,
  keys: string[],
  now: number,
): Promise<number> {
  let max = 0;
  for (const k of keys) {
    const r = await throttleRetryAfter(db, k, now);
    if (r > max) max = r;
  }
  return max;
}

/**
 * Bump the failure counter for `key`. If we cross THROTTLE_MAX_ATTEMPTS
 * inside the current rolling window, set a lock for THROTTLE_LOCK_SEC.
 * If the previous window has expired, reset the counter to 1.
 */
async function recordThrottleFailure(
  db: D1Database,
  key: string,
  now: number,
): Promise<void> {
  const row = await db
    .prepare('SELECT count, window_start FROM auth_throttle WHERE key = ?')
    .bind(key)
    .first<{ count: number; window_start: number }>();
  if (!row || now - row.window_start >= THROTTLE_WINDOW_SEC) {
    await db
      .prepare(
        'INSERT OR REPLACE INTO auth_throttle (key, count, window_start, locked_until) VALUES (?, 1, ?, NULL)',
      )
      .bind(key, now)
      .run();
    return;
  }
  const newCount = row.count + 1;
  const lockedUntil = newCount >= THROTTLE_MAX_ATTEMPTS ? now + THROTTLE_LOCK_SEC : null;
  await db
    .prepare('UPDATE auth_throttle SET count = ?, locked_until = ? WHERE key = ?')
    .bind(newCount, lockedUntil, key)
    .run();
}

/** Wipe throttle state for a key (called on a successful login). */
async function clearThrottle(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM auth_throttle WHERE key = ?').bind(key).run();
}

/**
 * Standard 429 response for a throttle hit. Sends a stable `code` so the
 * frontend can render a translated body string per locale, plus an English
 * `message` fallback for clients that don't recognize the code yet.
 */
function tooManyAttempts(
  c: any,
  retryAfter: number,
  code: 'rate_limited_login' | 'rate_limited_signup' | 'rate_limited_reset',
) {
  c.header('Retry-After', String(Math.max(1, retryAfter)));
  const minutes = Math.max(1, Math.ceil(retryAfter / 60));
  const englishBody =
    code === 'rate_limited_login'
      ? 'Too many sign-in attempts. Please wait a few minutes and try again.'
      : code === 'rate_limited_signup'
        ? 'Too many signup attempts. Please wait a few minutes and try again.'
        : 'Too many password reset attempts. Please wait a few minutes and try again.';
  return c.json(
    {
      code,
      message: englishBody,
      retryAfterSec: Math.max(1, retryAfter),
      retryAfterMinutes: minutes,
    },
    429,
  );
}

/**
 * Constant-time string compare for the Worker admin shared secret. Avoids
 * leaking the secret length / contents through response-time differences.
 */
function timingSafeStrEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------ Routes ------------------------------ */

app.get('/health', (c) => c.json({ ok: true, ts: nowSec() }));

app.post('/signup', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: 'Invalid request.' }, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const firstName = String(body.firstName || '').trim().slice(0, 60);
  const lastName = String(body.lastName || '').trim().slice(0, 60);

  if (!isValidEmail(email)) {
    return c.json({ message: 'Please enter a valid email address.' }, 400);
  }
  if (password.length < 6) {
    return c.json({ message: 'Password must be at least 6 characters.' }, 400);
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const now = nowSec();
  const ipKey = `signup:ip:${ip}`;
  const emailKey = `signup:email:${email}`;
  const lockedFor = await checkThrottles(c.env.DB, [ipKey, emailKey], now);
  if (lockedFor > 0) return tooManyAttempts(c, lockedFor, 'rate_limited_signup');

  const captchaOk = await verifyTurnstile(
    String(body.turnstileToken || ''),
    c.env.TURNSTILE_SECRET_KEY,
    ip,
  );
  if (!captchaOk) {
    await recordThrottleFailure(c.env.DB, ipKey, now);
    await recordThrottleFailure(c.env.DB, emailKey, now);
    return c.json({ message: 'Captcha check failed. Please try again.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) {
    await recordThrottleFailure(c.env.DB, ipKey, now);
    await recordThrottleFailure(c.env.DB, emailKey, now);
    return c.json({ message: 'An account with this email already exists.' }, 409);
  }

  const id = uuid();
  const hash = await hashPassword(password);
  const ts = nowSec();
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, first_name, last_name, email_verified, plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
  )
    .bind(id, email, hash, firstName || null, lastName || null, 'free', ts, ts)
    .run();

  await issueSession(c, id);
  return c.json({ id, email, firstName, lastName });
});

app.post('/login', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: 'Invalid request.' }, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!isValidEmail(email) || !password) {
    return c.json({ message: 'Please enter your email and password.' }, 400);
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const now = nowSec();
  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${email}`;
  const lockedFor = await checkThrottles(c.env.DB, [ipKey, emailKey], now);
  if (lockedFor > 0) return tooManyAttempts(c, lockedFor, 'rate_limited_login');

  const captchaOk = await verifyTurnstile(
    String(body.turnstileToken || ''),
    c.env.TURNSTILE_SECRET_KEY,
    ip,
  );
  if (!captchaOk) {
    await recordThrottleFailure(c.env.DB, ipKey, now);
    await recordThrottleFailure(c.env.DB, emailKey, now);
    return c.json({ message: 'Captcha check failed. Please try again.' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, password_hash, first_name, last_name, profile_image_url, plan FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{
      id: string;
      password_hash: string | null;
      first_name: string | null;
      last_name: string | null;
      profile_image_url: string | null;
      plan: string;
    }>();

  if (!user || !user.password_hash) {
    await recordThrottleFailure(c.env.DB, ipKey, now);
    await recordThrottleFailure(c.env.DB, emailKey, now);
    return c.json({ message: 'Wrong email or password.' }, 401);
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    await recordThrottleFailure(c.env.DB, ipKey, now);
    await recordThrottleFailure(c.env.DB, emailKey, now);
    return c.json({ message: 'Wrong email or password.' }, 401);
  }

  // Successful login wipes the failure counters so a legitimate user who
  // mistyped a few times before getting it right doesn't stay near the lock
  // threshold. We clear both axes for the same reason.
  await clearThrottle(c.env.DB, ipKey);
  await clearThrottle(c.env.DB, emailKey);

  // Rolling upgrade: if the stored hash is a legacy bcrypt one, transparently
  // re-hash to the Worker's native PBKDF2 format. Best-effort — if the update
  // fails, the user just stays on bcrypt and we'll try again next login.
  if (
    user.password_hash.startsWith('$2a$') ||
    user.password_hash.startsWith('$2b$') ||
    user.password_hash.startsWith('$2y$')
  ) {
    try {
      const upgraded = await hashPassword(password);
      await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .bind(upgraded, nowSec(), user.id)
        .run();
    } catch (err) {
      console.warn('[login] bcrypt → pbkdf2 upgrade failed', err);
    }
  }

  await issueSession(c, user.id);
  return c.json({
    id: user.id,
    email,
    firstName: user.first_name,
    lastName: user.last_name,
    profileImageUrl: user.profile_image_url,
    plan: user.plan,
  });
});

app.post('/logout', async (c) => {
  deleteCookie(c, 'afroai_session', { path: '/' });
  return c.json({ ok: true });
});

app.get('/me', async (c) => {
  const userId = await getCurrentUserId(c);
  if (!userId) return c.json({ user: null });
  const user = await c.env.DB.prepare(
    'SELECT id, email, first_name AS firstName, last_name AS lastName, profile_image_url AS profileImageUrl, plan FROM users WHERE id = ?',
  )
    .bind(userId)
    .first();
  return c.json({ user });
});

app.post('/forgot-password', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: true });
  }
  const email = String(body.email || '').trim().toLowerCase();

  // Always respond ok — never reveal whether the email exists
  if (!isValidEmail(email)) return c.json({ ok: true });

  // Per-IP and per-email throttling. The IP throttle hits a 429 with the
  // stable `rate_limited_reset` code so the frontend can render a translated
  // lock-out panel (matches the login/signup UX). The per-email throttle
  // stays silent (still returns 200 { ok: true }) so it can't be used as an
  // email-enumeration oracle — only the requester's own IP-bound abuse
  // produces the visible lock screen.
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const now = nowSec();
  const ipKey = `forgot:ip:${ip}`;
  const emailKey = `forgot:email:${email}`;
  const ipLockedFor = await checkThrottles(c.env.DB, [ipKey], now);
  if (ipLockedFor > 0) return tooManyAttempts(c, ipLockedFor, 'rate_limited_reset');
  const emailLockedFor = await checkThrottles(c.env.DB, [emailKey], now);
  if (emailLockedFor > 0) return c.json({ ok: true });

  // Every well-formed request counts toward the throttle (regardless of
  // whether the email exists), so an attacker can't blast reset emails.
  await recordThrottleFailure(c.env.DB, ipKey, now);
  await recordThrottleFailure(c.env.DB, emailKey, now);

  const user = await c.env.DB.prepare('SELECT id, first_name FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; first_name: string | null }>();
  if (!user) return c.json({ ok: true });

  // 256 bits of entropy, hex-encoded → 64 chars. Only the SHA-256 is stored.
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = [...tokenBytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await sha256Hex(rawToken);
  const ts = nowSec();
  const expiresAt = ts + 60 * 60; // 1 hour

  await c.env.DB.prepare(
    'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(uuid(), user.id, tokenHash, expiresAt, ts)
    .run();

  const resetUrl = `${c.env.APP_URL}/reset-password?token=${rawToken}`;
  try {
    await sendViaBridge(c.env, 'password_reset', email, {
      name: user.first_name || 'there',
      resetUrl,
    });
  } catch (err) {
    // Email failures are intentionally silent to the caller (we never want
    // to reveal whether the email exists), but logged for ops.
    console.error('[forgot-password] send failed', err);
  }
  return c.json({ ok: true });
});

/**
 * Admin-only endpoint used by the existing-user reset blast script.
 * Mints a single-use reset token (same shape as /forgot-password) and
 * returns the URL to the caller — the caller sends the email itself
 * (the blast script uses the "set_password" template via Express).
 *
 * Protected by the same INTERNAL_EMAIL_SECRET shared with Express, so we
 * don't have to manage another secret. Never exposed to end users.
 */
app.post('/admin/mint-reset-token', async (c) => {
  const secret = c.env.INTERNAL_EMAIL_SECRET;
  if (!secret) return c.json({ message: 'Mail bridge not configured.' }, 503);
  const auth = c.req.header('authorization') || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!timingSafeStrEq(provided, secret)) return c.json({ message: 'Unauthorized.' }, 401);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: 'Invalid request.' }, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) return c.json({ message: 'Invalid email.' }, 400);

  const user = await c.env.DB.prepare(
    'SELECT id, first_name FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ id: string; first_name: string | null }>();
  if (!user) return c.json({ message: 'No such user.' }, 404);

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = [...tokenBytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await sha256Hex(rawToken);
  const ts = nowSec();
  const expiresAt = ts + 60 * 60;

  await c.env.DB.prepare(
    'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(uuid(), user.id, tokenHash, expiresAt, ts)
    .run();

  // welcome=1 tells the /reset-password page that this is a first-time
  // "set your password" flow (migration blast), so it shows friendlier copy
  // instead of the default "Reset your password" wording.
  const resetUrl = `${c.env.APP_URL}/reset-password?token=${rawToken}&welcome=1`;
  return c.json({ ok: true, resetUrl, name: user.first_name || '' });
});

app.post('/reset-password', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: 'Invalid request.' }, 400);
  }
  const token = String(body.token || '');
  const password = String(body.password || '');

  if (!token || password.length < 6) {
    return c.json(
      { message: 'Please choose a password with at least 6 characters.' },
      400,
    );
  }

  // Throttle by IP and by token-prefix so an attacker can't brute-force reset
  // tokens by hammering this endpoint. We only count *invalid* token attempts
  // toward the throttle (a legit user with a valid link won't ever bump it).
  // The token-prefix bucket adds defence-in-depth across IPs while keeping
  // the key-space large enough that a single user retrying their own link
  // doesn't poison reset attempts for unrelated tokens.
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const now = nowSec();
  const tokenPrefix = token.slice(0, 8);
  const ipKey = `reset:ip:${ip}`;
  const tokenKey = `reset:token:${tokenPrefix}`;
  const lockedFor = await checkThrottles(c.env.DB, [ipKey, tokenKey], now);
  if (lockedFor > 0) return tooManyAttempts(c, lockedFor, 'rate_limited_reset');

  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?',
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; expires_at: number; used_at: number | null }>();

  if (!row || row.used_at || row.expires_at < nowSec()) {
    await recordThrottleFailure(c.env.DB, ipKey, now);
    await recordThrottleFailure(c.env.DB, tokenKey, now);
    return c.json(
      { message: 'This reset link has expired or already been used. Please request a new one.' },
      400,
    );
  }

  const newHash = await hashPassword(password);
  const ts = nowSec();
  // D1 batch runs atomically. We:
  //   1. Update the user's password hash
  //   2. Mark THIS specific reset token as used (auditable)
  //   3. Invalidate any other outstanding tokens for the same user
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(
      newHash,
      ts,
      row.user_id,
    ),
    c.env.DB.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').bind(
      ts,
      row.id,
    ),
    c.env.DB.prepare(
      'UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL AND id != ?',
    ).bind(ts, row.user_id, row.id),
  ]);

  await issueSession(c, row.user_id);
  // `loggedIn: true` tells the reset-password page that the cookie is now
  // set and it can route the user straight into the dashboard.
  return c.json({ ok: true, loggedIn: true });
});

/* ------------------------------ OAuth ------------------------------ */

const STATE_COOKIE = 'afroai_oauth_state';

async function makeStateToken(
  c: any,
  provider: string,
  redirectTo: string,
): Promise<string> {
  const secret = enc.encode(c.env.JWT_SECRET);
  return await new SignJWT({ provider, redirect: redirectTo, nonce: uuid() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
}

async function readStateToken(
  c: any,
  token: string,
): Promise<{ provider: string; redirect: string } | null> {
  try {
    const secret = enc.encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return {
      provider: String(payload.provider || ''),
      redirect: String(payload.redirect || c.env.APP_URL),
    };
  } catch {
    return null;
  }
}

/** Look up or create a user for an OAuth identity. Links by email if possible. */
async function upsertOAuthUser(
  db: D1Database,
  provider: string,
  providerUserId: string,
  email: string,
  firstName: string | null,
  lastName: string | null,
  profileImageUrl: string | null,
): Promise<string> {
  const linked = await db
    .prepare(
      'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?',
    )
    .bind(provider, providerUserId)
    .first<{ user_id: string }>();
  if (linked) return linked.user_id;

  const ts = nowSec();
  const normalisedEmail = email.toLowerCase();
  const existing = await db
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(normalisedEmail)
    .first<{ id: string }>();

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    userId = uuid();
    await db
      .prepare(
        'INSERT INTO users (id, email, first_name, last_name, profile_image_url, email_verified, plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      )
      .bind(
        userId,
        normalisedEmail,
        firstName,
        lastName,
        profileImageUrl,
        'free',
        ts,
        ts,
      )
      .run();
  }

  await db
    .prepare(
      'INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(uuid(), userId, provider, providerUserId, ts)
    .run();
  return userId;
}

function callbackUrl(c: any, provider: string): string {
  return new URL(c.req.url).origin + `/cf-auth/${provider}/callback`;
}

/**
 * Strict redirect-target validator for OAuth `redirect=` parameters.
 *
 * Allows ONLY exact, hard-coded canonical hosts — never wildcard subdomains.
 * Subdomain wildcards are dangerous here because user-published apps live on
 * subdomains of afroaigroup.com; a bad actor could craft a redirect that
 * forwards a freshly-authenticated user (and any auth-related URL fragments)
 * to a subdomain they control.
 */
function safeRedirect(target: string, appUrl: string): string {
  const ALLOWED_HOSTS = new Set([
    'afroaigroup.com',
    'www.afroaigroup.com',
  ]);
  try {
    const u = new URL(target, appUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return appUrl;
    if (ALLOWED_HOSTS.has(u.host)) {
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  return appUrl;
}

/* ----- Google ----- */

app.get('/google/start', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.text('Google login is not configured.', 500);
  }
  const redirectTo = safeRedirect(c.req.query('redirect') || c.env.APP_URL, c.env.APP_URL);
  const state = await makeStateToken(c, 'google', redirectTo);
  setCookie(c, STATE_COOKIE, state, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 600,
  });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl(c, 'google'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  return c.redirect(url.toString());
});

app.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const stateParam = c.req.query('state');
  const stateCookie = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/' });

  if (!code || !stateParam || stateParam !== stateCookie) {
    return c.text('Login flow expired. Please try again.', 400);
  }
  const state = await readStateToken(c, stateParam);
  if (!state || state.provider !== 'google') {
    return c.text('Login flow expired. Please try again.', 400);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(c, 'google'),
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error('Google token exchange failed', tokenRes.status, text);
    return c.text('Could not finish Google login. Please try again.', 502);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    return c.text('Could not finish Google login. Please try again.', 502);
  }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) return c.text('Could not load your Google profile.', 502);
  const profile = (await userRes.json()) as {
    sub: string;
    email?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
  };
  if (!profile.email) {
    return c.text('Your Google account did not share an email address.', 400);
  }

  const userId = await upsertOAuthUser(
    c.env.DB,
    'google',
    profile.sub,
    profile.email,
    profile.given_name || null,
    profile.family_name || null,
    profile.picture || null,
  );
  await issueSession(c, userId);
  return c.redirect(state.redirect);
});

/* ----- GitHub ----- */

app.get('/github/start', async (c) => {
  if (!c.env.GITHUB_CLIENT_ID) {
    return c.text('GitHub login is not configured.', 500);
  }
  const redirectTo = safeRedirect(c.req.query('redirect') || c.env.APP_URL, c.env.APP_URL);
  const state = await makeStateToken(c, 'github', redirectTo);
  setCookie(c, STATE_COOKIE, state, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 600,
  });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl(c, 'github'));
  url.searchParams.set('scope', 'read:user user:email');
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');
  return c.redirect(url.toString());
});

app.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const stateParam = c.req.query('state');
  const stateCookie = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/' });

  if (!code || !stateParam || stateParam !== stateCookie) {
    return c.text('Login flow expired. Please try again.', 400);
  }
  const state = await readStateToken(c, stateParam);
  if (!state || state.provider !== 'github') {
    return c.text('Login flow expired. Please try again.', 400);
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'afro-ai-auth',
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(c, 'github'),
    }),
  });
  if (!tokenRes.ok) {
    return c.text('Could not finish GitHub login. Please try again.', 502);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) {
    return c.text('Could not finish GitHub login. Please try again.', 502);
  }

  const ghHeaders = {
    Authorization: `Bearer ${tokenJson.access_token}`,
    'User-Agent': 'afro-ai-auth',
    Accept: 'application/vnd.github+json',
  };
  const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders });
  if (!userRes.ok) return c.text('Could not load your GitHub profile.', 502);
  const profile = (await userRes.json()) as {
    id: number;
    login: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };

  let email = profile.email || null;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: ghHeaders,
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary =
        emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
      email = primary?.email || null;
    }
  }
  if (!email) {
    return c.text('Your GitHub account does not have a verified email.', 400);
  }

  let firstName: string | null = null;
  let lastName: string | null = null;
  if (profile.name) {
    const parts = profile.name.trim().split(/\s+/);
    firstName = parts[0] || null;
    lastName = parts.slice(1).join(' ') || null;
  } else {
    firstName = profile.login || null;
  }

  const userId = await upsertOAuthUser(
    c.env.DB,
    'github',
    String(profile.id),
    email,
    firstName,
    lastName,
    profile.avatar_url || null,
  );
  await issueSession(c, userId);
  return c.redirect(state.redirect);
});

/* ------------------------------ Scheduled cleanup ------------------------------
 *
 * The auth_throttle table accumulates one row per unique (endpoint, IP|email)
 * combination that ever hits /login, /signup, or /forgot-password. Rows are
 * reused while the same key keeps hitting, but a one-off visitor's row sticks
 * around forever otherwise. Left unchecked this would balloon to millions of
 * rows in D1 over months.
 *
 * The cron below sweeps any row whose rolling window started more than 24h
 * ago AND that isn't currently inside an active lock. Active throttling is
 * untouched: a freshly-failed key still has window_start within the last
 * THROTTLE_WINDOW_SEC (15 min), and a locked key has locked_until > now.
 */
const THROTTLE_CLEANUP_AGE_SEC = 24 * 60 * 60;

async function cleanupAuthThrottle(db: D1Database, now: number): Promise<void> {
  const cutoff = now - THROTTLE_CLEANUP_AGE_SEC;
  await db
    .prepare(
      'DELETE FROM auth_throttle WHERE window_start < ? AND (locked_until IS NULL OR locked_until <= ?)',
    )
    .bind(cutoff, now)
    .run();
}

export default {
  fetch: root.fetch.bind(root),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      cleanupAuthThrottle(env.DB, nowSec()).catch((err) => {
        console.error('[cron] auth_throttle cleanup failed', err);
      }),
    );
  },
};
