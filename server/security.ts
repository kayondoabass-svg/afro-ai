import type { Request, Response, NextFunction } from "express";

const DANGEROUS_PATTERNS = [
  {
    pattern: /document\.cookie/gi,
    name: "Cookie access",
    severity: "high" as const,
    friendly: "Reads or writes browser cookies — not allowed for safety.",
  },
  {
    pattern: /localStorage\s*\.\s*(getItem|setItem|removeItem|clear)/gi,
    name: "localStorage access",
    severity: "medium" as const,
    friendly: "Saves data on the visitor's device.",
  },
  {
    pattern: /sessionStorage\s*\.\s*(getItem|setItem|removeItem|clear)/gi,
    name: "sessionStorage access",
    severity: "medium" as const,
    friendly: "Saves temporary data on the visitor's device.",
  },
  {
    pattern: /window\.(top|parent|opener)\s*\./gi,
    name: "Parent frame access",
    severity: "high" as const,
    friendly: "Tries to talk to the page that opened it — not allowed.",
  },
  {
    pattern: /eval\s*\(/gi,
    name: "eval() usage",
    severity: "high" as const,
    friendly: "Runs code from text — risky and not allowed.",
  },
  {
    pattern: /new\s+Function\s*\(/gi,
    name: "Function constructor",
    severity: "high" as const,
    friendly: "Builds code on the fly — risky and not allowed.",
  },
  {
    pattern: /fetch\s*\(\s*['"`]https?:\/\/(?!fonts\.googleapis|cdnjs\.cloudflare|cdn\.jsdelivr|unpkg\.com|api\.unsplash|images\.unsplash)/gi,
    name: "External fetch",
    severity: "medium" as const,
    friendly: "Calls an outside website that isn't on our trusted list.",
  },
  {
    pattern: /XMLHttpRequest/gi,
    name: "XMLHttpRequest",
    severity: "medium" as const,
    friendly: "Old-style network call — please use modern fetch instead.",
  },
  {
    pattern: /<script[^>]*src\s*=\s*['"](?!https:\/\/(cdn|cdnjs|unpkg|fonts)\.[a-z])/gi,
    name: "External script loading",
    severity: "medium" as const,
    friendly: "Loads code from an outside source we don't trust.",
  },
  {
    pattern: /crypto\s*\.\s*subtle/gi,
    name: "Crypto mining potential",
    severity: "high" as const,
    friendly: "Could be used to mine crypto on visitor devices — not allowed.",
  },
  {
    pattern: /WebSocket\s*\(/gi,
    name: "WebSocket connection",
    severity: "medium" as const,
    friendly: "Opens a live connection to an outside server.",
  },
  {
    pattern: /navigator\s*\.\s*(geolocation|mediaDevices|clipboard\.readText|credentials)/gi,
    name: "Sensitive API access",
    severity: "high" as const,
    friendly: "Asks for camera, location, or other private device features — not allowed.",
  },
  {
    pattern: /postMessage\s*\(/gi,
    name: "postMessage usage",
    severity: "low" as const,
    friendly: "Sends messages between page frames.",
  },
];

export interface ScanResult {
  safe: boolean;
  warnings: { name: string; severity: "high" | "medium" | "low"; count: number; friendly: string }[];
  blocked: boolean;
  reason?: string;
  friendlyReason?: string;
  autoFixHint?: string;
}

// Strip impersonation attributions ("Built by KEYO TECHNOLOGIES", "© KEYO", etc.)
// from end-user published sites. Defense-in-depth — the AI prompt also tells the
// model not to emit these, but a scammer could bypass the prompt by editing the
// HTML directly before publishing. This runs server-side on every publish.
const KEYO_IMPERSONATION_PATTERNS: RegExp[] = [
  // "Built by KEYO TECHNOLOGIES" / "Built by <a>KEYO TECHNOLOGIES</a>" / "Built by KEYO"
  /\s*(?:Built|Powered|Developed|Made|Created)\s+by\s*(?:<[^>]+>\s*)*\s*KEYO(?:\s+TECHNOLOGIES)?\s*(?:<\/[^>]+>\s*)*[.,]?/gi,
  // Standalone "© KEYO TECHNOLOGIES" copyright line
  /(?:©|&copy;|\(c\))\s*(?:\d{4}\s*)?KEYO(?:\s+TECHNOLOGIES)?[.,]?/gi,
  // "by KEYO TECHNOLOGIES" tagging on its own (rare but possible)
  /\s*by\s+KEYO\s+TECHNOLOGIES[.,]?/gi,
];
export function sanitizeKeyoImpersonation(html: string): string {
  if (!html) return html;
  let out = html;
  for (const re of KEYO_IMPERSONATION_PATTERNS) {
    out = out.replace(re, "");
  }
  // Collapse any double-spaces / orphan dots we just created.
  out = out.replace(/  +/g, " ").replace(/\s+\./g, ".").replace(/\.\s*\./g, ".");
  return out;
}

export function scanHtmlContent(html: string): ScanResult {
  const warnings: ScanResult["warnings"] = [];
  let highCount = 0;

  for (const { pattern, name, severity, friendly } of DANGEROUS_PATTERNS) {
    const matches = html.match(pattern);
    if (matches && matches.length > 0) {
      warnings.push({ name, severity, count: matches.length, friendly });
      if (severity === "high") highCount += matches.length;
    }
  }

  const blocked = highCount >= 1;
  const blockingNames = warnings.filter(w => w.severity === "high").map(w => w.name);

  return {
    safe: warnings.length === 0,
    warnings,
    blocked,
    reason: blocked
      ? `Content blocked: ${highCount} high-severity security issues detected (${blockingNames.join(", ")})`
      : undefined,
    friendlyReason: blocked
      ? `Your app uses ${blockingNames.length === 1 ? "a feature" : "features"} we don't allow on published sites for safety: ${warnings.filter(w => w.severity === "high").map(w => w.friendly).join(" ")}`
      : undefined,
    autoFixHint: blocked
      ? `Remove the following from my app so it can be published safely, but keep the design and all other features exactly the same: ${blockingNames.join(", ")}. Replace any blocked feature with a safe alternative (for example, replace cookies/localStorage with a simple in-memory variable, replace eval() with normal function calls, remove any geolocation/camera prompts).`
      : undefined,
  };
}

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
}

export function publishedAppHeaders(res: Response) {
  res.setHeader("Content-Security-Policy",
    "default-src 'self' 'unsafe-inline' data: blob:; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; " +
    "img-src * data: blob:; " +
    "media-src * data: blob:; " +
    "connect-src 'self' https://api.unsplash.com https://fonts.googleapis.com; " +
    "frame-src 'none'; " +
    "object-src 'none'; " +
    "base-uri 'none'; " +
    "form-action 'self'; " +
    "frame-ancestors 'self' https://afroaigroup.com https://*.afroaigroup.com;"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
}
