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

interface Env {
  DB: D1Database;
  APP_URL: string;
  COOKIE_DOMAIN: string;
  JWT_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();
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
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    km,
    256,
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return `pbkdf2$200000$${saltB64}$${hashB64}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
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

async function issueSession(c: any, userId: string) {
  const secret = enc.encode(c.env.JWT_SECRET);
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
  setCookie(c, 'afroai_session', token, {
    domain: c.env.COOKIE_DOMAIN,
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

async function sendPasswordResetEmail(
  apiKey: string,
  to: string,
  name: string,
  url: string,
): Promise<void> {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Afro AI <noreply@afroaigroup.com>',
      to,
      subject: 'Reset your Afro AI password',
      html: `
        <p>Hi ${name},</p>
        <p>You asked to reset your Afro AI password. Tap the button below to choose a new one:</p>
        <p><a href="${url}" style="background:#F59E0B;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reset my password</a></p>
        <p>Or copy this link into your browser: <br>${url}</p>
        <p>This link expires in 1 hour. If you didn't ask for this, you can safely ignore this message.</p>
        <p>— Afro AI</p>
      `,
    }),
  });
}

/* ------------------------------ Routes ------------------------------ */

app.get('/health', (c) => c.json({ ok: true, ts: nowSec() }));

app.post('/api/auth/signup', async (c) => {
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

  const ip = c.req.header('CF-Connecting-IP');
  const captchaOk = await verifyTurnstile(
    String(body.turnstileToken || ''),
    c.env.TURNSTILE_SECRET_KEY,
    ip,
  );
  if (!captchaOk) {
    return c.json({ message: 'Captcha check failed. Please try again.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) {
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

app.post('/api/auth/login', async (c) => {
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

  const ip = c.req.header('CF-Connecting-IP');
  const captchaOk = await verifyTurnstile(
    String(body.turnstileToken || ''),
    c.env.TURNSTILE_SECRET_KEY,
    ip,
  );
  if (!captchaOk) {
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
    return c.json({ message: 'Wrong email or password.' }, 401);
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return c.json({ message: 'Wrong email or password.' }, 401);
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

app.post('/api/auth/logout', async (c) => {
  deleteCookie(c, 'afroai_session', { domain: c.env.COOKIE_DOMAIN, path: '/' });
  return c.json({ ok: true });
});

app.get('/api/auth/me', async (c) => {
  const userId = await getCurrentUserId(c);
  if (!userId) return c.json({ user: null });
  const user = await c.env.DB.prepare(
    'SELECT id, email, first_name AS firstName, last_name AS lastName, profile_image_url AS profileImageUrl, plan FROM users WHERE id = ?',
  )
    .bind(userId)
    .first();
  return c.json({ user });
});

app.post('/api/auth/forgot-password', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: true });
  }
  const email = String(body.email || '').trim().toLowerCase();

  // Always respond ok — never reveal whether the email exists
  if (!isValidEmail(email)) return c.json({ ok: true });

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
  if (c.env.RESEND_API_KEY) {
    try {
      await sendPasswordResetEmail(
        c.env.RESEND_API_KEY,
        email,
        user.first_name || 'there',
        resetUrl,
      );
    } catch (err) {
      console.error('Failed to send reset email', err);
    }
  } else {
    console.log('Password reset URL (no email provider configured):', resetUrl);
  }
  return c.json({ ok: true });
});

app.post('/api/auth/reset-password', async (c) => {
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

  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?',
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; expires_at: number; used_at: number | null }>();

  if (!row || row.used_at || row.expires_at < nowSec()) {
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
  return c.json({ ok: true });
});

export default app;
