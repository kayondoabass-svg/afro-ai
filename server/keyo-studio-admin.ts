import type { Express, RequestHandler } from "express";
import { z } from "zod";
import type { KeyoAdminStore } from "./keyo-studio-admin-store";
import { KEYO_PUBLIC_LINKS } from "../scripts/keyo-release-assets";

const emailSchema = z.string().trim().toLowerCase().max(254).email();
const BASE = "/api/keyo-studio/admin";

export function registerKeyoStudioAdmin(app: Express, options: {
  authenticate: RequestHandler;
  founderEmail: string;
  store: KeyoAdminStore;
  getRelease: () => Promise<unknown>;
  allowedOrigins?: readonly string[];
}) {
  const { store, authenticate, getRelease } = options;
  const founderEmail = options.founderEmail.trim().toLowerCase();
  const identity = (req: any) => ({
    email: String(req.user?.claims?.email ?? "").trim().toLowerCase(),
    userId: String(req.user?.claims?.sub ?? ""),
    verified: req.user?.claims?.email_verified !== false,
  });
  const guard = (founderOnly = false): RequestHandler => async (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const user = identity(req);
      if (!user.userId || !user.email || !user.verified) return void res.status(403).json({ message: "Verified account required." });
      if (req.method !== "GET") {
        const origin = req.get("origin");
        const expectedOrigin = `${req.protocol}://${req.get("host")}`;
        if (req.get("sec-fetch-site") === "cross-site" || (origin && origin !== expectedOrigin && !options.allowedOrigins?.includes(origin))) {
          return void res.status(403).json({ message: "Cross-origin dashboard changes are not allowed." });
        }
      }
      if (user.email === founderEmail) return next();
      if (founderOnly || !(await store.hasInvite(user.email))) return void res.status(403).json({ message: "Private KEYO dashboard. Founder authorization required." });
      next();
    } catch (error) { next(error); }
  };
  const handle = (fn: (req: any, res: any) => Promise<void>): RequestHandler =>
    (req, res, next) => { void fn(req, res).catch(next); };

  app.get(BASE, authenticate, guard(), handle(async (req, res) => {
    const isFounder = identity(req).email === founderEmail;
    const [invites, activeViewersCount, release] = await Promise.all([
      store.listInvites(), store.activeCount(founderEmail), getRelease(),
    ]);
    res.json({ isFounder, authorizedUsersCount: 1 + invites.filter(i => i.email !== founderEmail).length,
      activeViewersCount, presenceWindowSeconds: 90,
      invites: isFounder ? invites : [], release, publicLinks: KEYO_PUBLIC_LINKS });
  }));
  app.post(`${BASE}/invites`, authenticate, guard(true), handle(async (req, res) => {
    const parsed = emailSchema.safeParse(req.body?.email);
    if (!parsed.success) return void res.status(400).json({ message: "Enter a valid email address." });
    if (parsed.data === founderEmail) return void res.status(400).json({ message: "The founder already has access." });
    await store.grant(parsed.data, identity(req).userId);
    res.status(201).json({ message: "Viewer access granted. The user must sign in with this email." });
  }));
  app.delete(`${BASE}/invites/:email`, authenticate, guard(true), handle(async (req, res) => {
    const parsed = emailSchema.safeParse(req.params.email);
    if (!parsed.success || parsed.data === founderEmail) return void res.status(400).json({ message: "Invalid invitation." });
    await store.revoke(parsed.data);
    res.json({ message: "Access revoked." });
  }));
  app.post(`${BASE}/presence`, authenticate, guard(), handle(async (req, res) => {
    const user = identity(req);
    await store.touch(user.userId, user.email);
    res.status(204).end();
  }));
  app.delete(`${BASE}/presence`, authenticate, guard(), handle(async (req, res) => {
    await store.leave(identity(req).userId);
    res.status(204).end();
  }));
}
