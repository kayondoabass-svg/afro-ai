import type { RequestHandler } from "express";

/** Applies before auth, so errors and redirects are protected too. Public assets remain cacheable. */
export const privateResponseCache: RequestHandler = (req, res, next) => {
  if (/^\/(?:api|cf-auth|auth)(?:\/|$)/.test(req.path) ||
      /^\/(?:dashboard|billing|pricing\/checkout|domains|chatbots|email-api|media|chat|ussd)(?:\/|$)/.test(req.path)) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Cloudflare-CDN-Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.vary("Cookie");
    res.vary("Authorization");
  }
  next();
};
