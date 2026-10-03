import { jwtVerify } from "jose";

export const PLATFORM_ISSUER = "https://afroaigroup.com/cf-auth";
export const PLATFORM_AUDIENCE = "afro-ai-platform";
export const PLATFORM_PURPOSE = "platform_session";

export async function verifyPlatformSession(token: string, secret: Uint8Array) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
    issuer: PLATFORM_ISSUER,
    audience: PLATFORM_AUDIENCE,
    requiredClaims: ["sub", "exp", "iat", "sid", "kind"],
  });
  if (payload.kind !== PLATFORM_PURPOSE || typeof payload.sid !== "string" || !payload.sid) {
    throw new Error("Invalid session purpose");
  }
  return payload;
}