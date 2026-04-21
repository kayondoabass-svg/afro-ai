import type { RequestHandler } from "express";
import { jwtVerify } from "jose";
import { parse as parseCookie } from "cookie";
import { authStorage } from "./storage";

const COOKIE_NAME = "afroai_session";
const enc = new TextEncoder();

interface CfClaims {
  sub: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
}

/**
 * Bridges Cloudflare Worker sessions into Express.
 *
 * Reads the `afroai_session` cookie (signed by the Worker with the shared
 * JWT_SECRET), verifies it, and — if the user does not yet exist in Postgres
 * — lazily creates them. After this middleware, `req.user` has the same
 * `{ claims: { sub, email, first_name, last_name, profile_image_url } }` shape
 * that Passport produces, so the existing `isAuthenticated` middleware and
 * downstream routes do not need to change.
 *
 * Existing Passport sessions take precedence — this only fires when Passport
 * has not authenticated the request, which means logged-in users keep
 * working untouched during the cutover.
 */
export function cfAuthBridge(): RequestHandler {
  return async (req, _res, next) => {
    try {
      // Already authenticated by Passport? Leave it alone.
      if (typeof req.isAuthenticated === "function" && req.isAuthenticated()) {
        return next();
      }

      const cookieHeader = req.headers.cookie;
      if (!cookieHeader) return next();

      const cookies = parseCookie(cookieHeader);
      const token = cookies[COOKIE_NAME];
      if (!token) return next();

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error("[cfBridge] JWT_SECRET not set — cannot verify Worker session");
        return next();
      }

      const { payload } = await jwtVerify(token, enc.encode(secret));
      const claims = payload as unknown as CfClaims;
      if (!claims.sub) return next();

      // Lazy mirror into Postgres. authStorage.upsertUser dedupes by email
      // (so an existing Postgres row for the same email gets reused, even
      // if its id differs — its existing id is preserved).
      const dbUser = await authStorage.upsertUser({
        id: claims.sub,
        email: claims.email || undefined,
        firstName: claims.first_name || undefined,
        lastName: claims.last_name || undefined,
        profileImageUrl: claims.profile_image_url || undefined,
      });

      // Shape req.user identically to what Passport produces in this codebase.
      (req as any).user = {
        claims: {
          sub: dbUser.id,
          email: dbUser.email || claims.email || "",
          first_name: dbUser.firstName || claims.first_name || "",
          last_name: dbUser.lastName || claims.last_name || "",
          profile_image_url: dbUser.profileImageUrl || claims.profile_image_url || "",
        },
      };

      // Make req.isAuthenticated() return true for the rest of the chain
      // without disturbing Passport's own implementation.
      const original = req.isAuthenticated?.bind(req);
      req.isAuthenticated = ((): boolean => {
        if (original && original()) return true;
        return Boolean((req as any).user);
      }) as typeof req.isAuthenticated;
    } catch (err: any) {
      // Invalid / expired token — silently fall through as anonymous.
      if (err?.code !== "ERR_JWS_INVALID" && err?.code !== "ERR_JWT_EXPIRED") {
        console.warn("[cfBridge] verify failed:", err?.code || err?.message || err);
      }
    }
    next();
  };
}
