import type { Request, Response, NextFunction } from "express";

const DANGEROUS_PATTERNS = [
  { pattern: /document\.cookie/gi, name: "Cookie access", severity: "high" as const },
  { pattern: /localStorage\s*\.\s*(getItem|setItem|removeItem|clear)/gi, name: "localStorage access", severity: "medium" as const },
  { pattern: /sessionStorage\s*\.\s*(getItem|setItem|removeItem|clear)/gi, name: "sessionStorage access", severity: "medium" as const },
  { pattern: /window\.(top|parent|opener)\s*\./gi, name: "Parent frame access", severity: "high" as const },
  { pattern: /eval\s*\(/gi, name: "eval() usage", severity: "high" as const },
  { pattern: /new\s+Function\s*\(/gi, name: "Function constructor", severity: "high" as const },
  { pattern: /fetch\s*\(\s*['"`]https?:\/\/(?!fonts\.googleapis|cdnjs\.cloudflare|cdn\.jsdelivr|unpkg\.com|api\.unsplash|images\.unsplash)/gi, name: "External fetch", severity: "medium" as const },
  { pattern: /XMLHttpRequest/gi, name: "XMLHttpRequest", severity: "medium" as const },
  { pattern: /<script[^>]*src\s*=\s*['"](?!https:\/\/(cdn|cdnjs|unpkg|fonts)\.[a-z])/gi, name: "External script loading", severity: "medium" as const },
  { pattern: /crypto\s*\.\s*subtle/gi, name: "Crypto mining potential", severity: "high" as const },
  { pattern: /WebSocket\s*\(/gi, name: "WebSocket connection", severity: "medium" as const },
  { pattern: /navigator\s*\.\s*(geolocation|mediaDevices|clipboard\.readText|credentials)/gi, name: "Sensitive API access", severity: "high" as const },
  { pattern: /postMessage\s*\(/gi, name: "postMessage usage", severity: "low" as const },
];

export interface ScanResult {
  safe: boolean;
  warnings: { name: string; severity: "high" | "medium" | "low"; count: number }[];
  blocked: boolean;
  reason?: string;
}

export function scanHtmlContent(html: string): ScanResult {
  const warnings: ScanResult["warnings"] = [];
  let highCount = 0;

  for (const { pattern, name, severity } of DANGEROUS_PATTERNS) {
    const matches = html.match(pattern);
    if (matches && matches.length > 0) {
      warnings.push({ name, severity, count: matches.length });
      if (severity === "high") highCount += matches.length;
    }
  }

  const blocked = highCount >= 1;

  return {
    safe: warnings.length === 0,
    warnings,
    blocked,
    reason: blocked
      ? `Content blocked: ${highCount} high-severity security issues detected (${warnings.filter(w => w.severity === "high").map(w => w.name).join(", ")})`
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
