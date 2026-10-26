import { authFeatures } from "./auth-packages";

export const BRANDING_DEFAULTS = {
  logoUrl: "", color: "#eab308", senderName: "", replyTo: "", domainId: null as number | null,
  fromAddress: "", verifySubject: "", verifyIntro: "", resetSubject: "", resetIntro: "",
  footer: "", verifyHtml: "", resetHtml: "",
};
export type AuthBranding = typeof BRANDING_DEFAULTS;
const groups = {
  identity: ["logoUrl", "color", "senderName", "replyTo"],
  senderDomain: ["domainId", "fromAddress"],
  copy: ["verifySubject", "verifyIntro", "resetSubject", "resetIntro", "footer"],
  html: ["verifyHtml", "resetHtml"],
} as const;
export function effectiveBranding(settings: Partial<AuthBranding>, plan: string): AuthBranding {
  const result = { ...BRANDING_DEFAULTS, ...settings };
  const features = authFeatures(plan);
  for (const [feature, fields] of Object.entries(groups)) if (!features[feature as keyof typeof features])
    for (const field of fields) (result as any)[field] = BRANDING_DEFAULTS[field as keyof AuthBranding];
  return result;
}
export function lockedBrandingFields(settings: Partial<AuthBranding>, plan: string) {
  const effective = effectiveBranding(settings, plan);
  return Object.keys(BRANDING_DEFAULTS).filter(k => (settings as any)[k] != null &&
    (settings as any)[k] !== (effective as any)[k]);
}
export function escapeMail(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
export function validLogo(value: string) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password &&
    url.port === "" && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(url.hostname); } catch { return false; }
}
/** Deliberately constrained HTML, not arbitrary HTML with a fragile blacklist.
 * No script/style/form/iframe, external links, attributes, remote CSS or template expressions.
 * The service appends its uneditable security action and never interpolates raw customer HTML.
 */
export function validTemplate(html: string) {
  if (html.length > 12000) return false;
  const withoutTags = html.replace(/<\/?(?:p|div|span|strong|b|em|i|h[1-4]|ul|ol|li|br|hr|table|tbody|tr|td)\s*\/?>/gi, "");
  return !/[<>]/.test(withoutTags) && !/&#?(?:x0*3c|0*60);/i.test(withoutTags);
}
export function validateBranding(input: unknown, current: AuthBranding, plan: string): AuthBranding {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Supply branding settings.");
  const next = { ...current };
  for (const key of Object.keys(input)) {
    if (!(key in BRANDING_DEFAULTS)) throw new Error(`Unknown branding setting: ${key}`);
    const value = (input as any)[key];
    if (key === "domainId") {
      if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) throw new Error("Select an owned sending domain.");
    } else if (typeof value !== "string" || value.length > (key.endsWith("Html") ? 12000 : key.endsWith("Intro") ? 1500 : 500))
      throw new Error(`Invalid ${key}.`);
    (next as any)[key] = value;
  }
  const features = authFeatures(plan);
  for (const [feature, fields] of Object.entries(groups)) if (!features[feature as keyof typeof features])
    for (const field of fields) if ((next as any)[field] !== (current as any)[field])
      throw new Error(`Upgrade your Auth package to change ${field}.`);
  if (!/^#[0-9a-f]{6}$/i.test(next.color)) throw new Error("Use a six-digit brand colour.");
  if (!validLogo(next.logoUrl)) throw new Error("Use a public HTTPS logo URL without credentials.");
  if (/[<>\r\n]/.test(next.senderName) || /[\r\n]/.test(next.verifySubject + next.resetSubject))
    throw new Error("Sender names and subjects cannot contain headers or markup.");
  for (const value of [next.replyTo, next.fromAddress]) if (value && !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/.test(value))
    throw new Error("Use a valid email address without a display name.");
  if (!validTemplate(next.verifyHtml) || !validTemplate(next.resetHtml))
    throw new Error("Templates allow basic formatting tags only, without attributes, scripts, styles, forms or links. The secure action is added automatically.");
  return next;
}
export function renderAuthEmail(input: {
  name: string; purpose: "verify" | "reset"; url: string; plan: string;
  settings?: Partial<AuthBranding>; platformFrom?: string; senderVerified?: boolean;
}) {
  const { name, purpose, url, plan } = input;
  const s = effectiveBranding(input.settings || {}, plan);
  const action = purpose === "verify" ? "Confirm your email" : "Reset your password";
  const subject = (purpose === "verify" ? s.verifySubject : s.resetSubject) || `${action} — ${name}`;
  const intro = (purpose === "verify" ? s.verifyIntro : s.resetIntro) || `${action} for ${name}.`;
  const custom = purpose === "verify" ? s.verifyHtml : s.resetHtml;
  const expiry = purpose === "verify" ? "This link expires in 24 hours." : "This link expires in one hour.";
  const platformFrom = input.platformFrom || "Afro AI <noreply@afroaigroup.com>";
  const platformAddress = platformFrom.match(/<([^>]+)>/)?.[1] || platformFrom;
  const address = input.senderVerified && s.domainId && s.fromAddress ? s.fromAddress : platformAddress;
  const from = s.senderName ? `${s.senderName} <${address}>` : address !== platformAddress ? `${name.replace(/[<>\r\n]/g, "")} <${address}>` : platformFrom;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:24px"><div style="max-width:560px;margin:auto;background:white;padding:28px;border-radius:12px">
    ${s.logoUrl ? `<img src="${escapeMail(s.logoUrl)}" alt="${escapeMail(name)}" width="120">` : ""}
    <h1>${escapeMail(name)}</h1><p>${escapeMail(intro)}</p>
    ${custom && validTemplate(custom) ? custom : ""}
    <p><a href="${escapeMail(url)}" style="display:inline-block;padding:14px 20px;background:${s.color};color:#111;text-decoration:none;border-radius:6px">${action}</a></p>
    <p>${expiry} If you did not request this, ignore this email.</p>
    ${s.footer ? `<p>${escapeMail(s.footer)}</p>` : ""}
    ${s.replyTo ? `<p>Support: ${escapeMail(s.replyTo)}</p>` : ""}
    ${!authFeatures(plan).whiteLabel ? "<p>Powered by Afro Auth</p>" : ""}
    </div></body></html>`;
  return { from, subject, html, text: `${intro}\n${action}: ${url}\n${expiry} If you did not request this, ignore this email.\n${s.footer}${s.replyTo ? `\nSupport: ${s.replyTo}` : ""}${!authFeatures(plan).whiteLabel ? "\nPowered by Afro Auth" : ""}`,
    ...(s.replyTo ? { replyTo: s.replyTo } : {}) };
}
