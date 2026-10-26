export function deviceLabel(ua: string): string {
  const os = /iPhone|iPad/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Unknown device";
  const browser = /Edg/i.test(ua) ? "Edge" : /Firefox|FxiOS/i.test(ua) ? "Firefox" : /Chrome|CriOS/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

export function resetPasswordUrl(origin: string, token: string, welcome = false): string {
  const url = new URL("/reset-password", origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Password reset requires HTTPS");
  url.searchParams.set("token", token);
  if (welcome) url.searchParams.set("welcome", "1");
  return url.toString();
}

// Each statement is conditioned on the same unused token. D1 batch is atomic,
// so concurrent clicks cannot change the password twice or leave sessions valid.
export const resetStatements = [
  "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM password_reset_tokens WHERE id = ? AND used_at IS NULL AND expires_at > ?)",
  "UPDATE device_sessions SET revoked_at = ? WHERE (user_id = ? OR email = (SELECT lower(email) FROM users WHERE id = ?)) AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM password_reset_tokens WHERE id = ? AND used_at IS NULL AND expires_at > ?)",
  "UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL AND EXISTS (SELECT 1 FROM password_reset_tokens AS active WHERE active.id = ? AND active.used_at IS NULL AND active.expires_at > ?)",
] as const;