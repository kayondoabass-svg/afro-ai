/** Use the dashboard's authoritative session and verification check. Never
 * infer verification from the D1 mirror or accept a customer-app token. */
export async function platformAdminIdentity(c: any): Promise<{ id: string; email: string } | Response> {
  c.header('Cache-Control', 'no-store');
  const unavailable = () => c.json({
    code: 'AUTH_CHECK_UNAVAILABLE',
    message: 'We could not check your account right now. Please try again shortly.',
  }, 503);
  const cookie = c.req.header('Cookie');
  if (!cookie) return c.json({ code: 'SIGN_IN_REQUIRED', message: 'Your session has expired. Please sign in again.' }, 401);
  try {
    const response = await fetch(new URL('/api/auth/user', c.env.EXPRESS_BASE_URL || c.env.APP_URL), {
      headers: { Cookie: cookie },
      // workerd rejects redirect:"error" before sending any request.
      // Manual mode keeps cookies on the configured host; 3xx fails below.
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401) {
      return c.json({ code: 'SIGN_IN_REQUIRED', message: 'Your session has expired. Please sign in again.' }, 401);
    }
    if (!response.ok) return unavailable();
    const profile: any = await response.json();
    if (typeof profile?.id !== 'string' || !profile.id || typeof profile.email !== 'string' || !profile.email) return unavailable();
    if (!profile.emailVerified) return c.json({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'Verify your email address before managing Afro Auth projects.',
    }, 403);
    // Express can reuse an older account ID when mirroring a Worker login.
    // Retain the existing D1 owner ID for the same verified platform email.
    // Passport-only accounts need no synthetic Worker session or user record.
    const rows = await c.env.DB.prepare(
      "SELECT id FROM users WHERE tenant_id = 'platform' AND lower(email) = lower(?)",
    ).bind(profile.email).all();
    if ((rows.results || []).length > 1) return unavailable();
    return { id: rows.results?.[0]?.id || profile.id, email: profile.email };
  } catch {
    return unavailable();
  }
}