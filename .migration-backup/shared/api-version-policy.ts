/**
 * Compatibility routing only. Authentication, validation, quotas and business
 * operations remain in the original handlers. Do not change a v1 contract here.
 */
export const API_VERSION = "v1";
export const API_VERSION_HEADER = "X-Afro-API-Version";

export const API_ALIASES = [
  { versioned: "email-marketing", legacy: "email", label: "Email campaigns and subscribers" },
  { versioned: "email", legacy: "email-api", label: "Email delivery and API management" },
  { versioned: "email-api", legacy: "email-api", label: "Email delivery compatibility spelling" },
  { versioned: "project-files", legacy: "d1/project-files", label: "Private project-file storage" },
  ...[
    ["chatbots", "Chatbot management and knowledge"],
    ["widget-chat", "Website chatbot messages"],
    ["chatbot-subscription", "Chatbot subscription"],
    ["domains", "Domain registration"],
    ["domain-manager", "Domain and DNS management"],
    ["ussd", "USSD applications and gateway"],
    ["projects", "Projects and infrastructure"],
    ["published-apps", "Published applications"],
    ["publish", "Application publishing"],
    ["files", "Uploaded files"],
    ["upload", "File upload"],
    ["zip-exports", "Project exports"],
    ["import", "Project imports"],
    ["knowledge", "Knowledge sources"],
    ["media", "Media generation"],
    ["audio", "Audio"],
    ["vibe", "Builder"],
    ["conversations", "Conversations"],
    ["versions", "API discovery and saved project versions"],
    ["secrets", "Private project secrets"],
    ["forms", "Forms and submissions"],
    ["app-installs", "Application installations"],
    ["collaborate", "Project collaboration"],
    ["team", "Team management"],
    ["usage", "Usage"],
    ["payments", "Customer payments"],
    ["payg", "Pay-as-you-go billing"],
    ["subscribe", "Subscriptions"],
    ["marketplace", "Marketplace"],
    ["integrations", "Customer integrations"],
    ["email-audit", "Email audit"],
    ["demo-chat", "Public chatbot demonstration"],
    ["health", "Service health"],
  ].map(([versioned, label]) => ({ versioned, legacy: versioned, label })),
  { versioned: "public/domains/check", legacy: "public/domains/check", label: "Public domain availability" },
] as const;

export type VersionResolution =
  | { kind: "legacy"; version?: string }
  | { kind: "supported"; version: string; target: string }
  | { kind: "unsupported"; version: string }
  | { kind: "unknown"; version: string };

function below(path: string, prefix: string, ignoreCase = false) {
  if (ignoreCase) {
    path = path.toLowerCase();
    prefix = prefix.toLowerCase();
  }
  return path === prefix || path.startsWith(prefix + "/");
}

export function resolvePlatformApi(path: string): VersionResolution {
  const match = path.match(/^\/api\/(v\d+)(\/.*)?$/i);
  if (!match) {
    const known = API_ALIASES.some(a => below(path, `/api/${a.legacy}`, true));
    return { kind: "legacy", ...(known ? { version: API_VERSION } : {}) };
  }
  const version = match[1].toLowerCase();
  if (version !== API_VERSION) return { kind: "unsupported", version };
  if (/^\/api\/v1\/chatbot\/message\/?$/i.test(path)) {
    return { kind: "supported", version, target: path };
  }
  const suffix = match[2] || "";
  const alias = API_ALIASES.find(a => below(suffix, "/" + a.versioned, true));
  if (!alias) return { kind: "unknown", version };
  return {
    kind: "supported", version,
    target: `/api/${alias.legacy}${suffix.slice(alias.versioned.length + 1)}`,
  };
}

export function resolveAuthApi(path: string): VersionResolution {
  const match = path.match(/^\/cf-auth\/(v\d+)(\/.*)?$/);
  if (!match) {
    return { kind: "legacy", ...(below(path, "/cf-auth/t") ? { version: API_VERSION } : {}) };
  }
  const version = match[1];
  if (version !== API_VERSION) return { kind: "unsupported", version };
  const suffix = match[2] || "";
  if (below(suffix, "/t")) {
    return { kind: "supported", version, target: `/cf-auth${suffix}` };
  }
  // Existing management endpoints must not be routed into platform login,
  // OAuth callbacks, run-code, or other cookie-authenticated platform routes.
  if (["/admin", "/sessions", "/users"].some(prefix => below(suffix, prefix))) {
    return { kind: "supported", version, target: path };
  }
  return { kind: "unknown", version };
}

export function versionError(result: { kind: "unsupported" | "unknown"; version: string }) {
  return {
    code: result.kind === "unsupported" ? "UNSUPPORTED_API_VERSION" : "VERSIONED_ENDPOINT_NOT_FOUND",
    message: result.kind === "unsupported"
      ? "This API version is not supported. Use a documented v1 endpoint."
      : "This endpoint is not part of API v1.",
    supportedVersions: [API_VERSION],
    documentation: "/docs/api/versioning",
  };
}

// These handlers define their own public CORS policy. Let OPTIONS reach them
// rather than terminating it at the platform dashboard's origin allowlist.
export function hasEndpointPreflight(path: string) {
  return /^\/api\/(?:v\d+\/)?(?:widget-chat\/|ussd\/gateway\/|email-audit(?:\/|$)|demo-chat(?:\/|$))/i.test(path);
}
