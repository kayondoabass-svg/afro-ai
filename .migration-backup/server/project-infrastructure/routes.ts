import type { Express, Request } from "express";
import { rateLimit } from "express-rate-limit";
import { isAuthenticated } from "../replit_integrations/auth";
import { ProjectFileError } from "../project-file-policy";
import { infrastructureView, provisionInfrastructure, deleteInfrastructure } from "./service";

/** Exact management origins only: never trust a customer subdomain or wildcard suffix. */
export function isManagementOrigin(origin: unknown) {
  const allowed = new Set(["https://afroaigroup.com", "https://www.afroaigroup.com", "https://api.afroaigroup.com"]);
  if (process.env.NODE_ENV !== "production") {
    if (process.env.REPLIT_DEV_DOMAIN) allowed.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    allowed.add("http://localhost:5000");
    allowed.add("http://127.0.0.1:5000");
  }
  return typeof origin === "string" && allowed.has(origin);
}

export function registerProjectInfrastructureRoutes(app: Express) {
  const limiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: true, legacyHeaders: false });
  const identity = (req: Request) => {
    const userId = (req as any).user?.claims?.sub;
    if (typeof userId !== "string" || !userId) throw new ProjectFileError(401, "Sign in to continue.");
    return { userId, id: Number(req.params.id) };
  };
  const failure = (res: any, error: unknown) => res.status(error instanceof ProjectFileError ? error.status : 503)
    .json({ message: error instanceof ProjectFileError ? error.message : "Project infrastructure is unavailable. The administrator may need to apply its database migration." });
  app.get("/api/projects/:id/infrastructure", isAuthenticated, limiter, async (req, res) => {
    try { const { userId, id } = identity(req); res.json(await infrastructureView(userId, id)); }
    catch (error) { failure(res, error); }
  });
  for (const action of ["provision", "delete"] as const) {
    app.post(`/api/projects/:id/infrastructure/${action}`, isAuthenticated, limiter, async (req, res) => {
      try {
        if (!isManagementOrigin(req.headers.origin) || !req.is("application/json")) {
          throw new ProjectFileError(403, "Use the signed-in Afro AI dashboard for this operation.");
        }
        const { userId, id } = identity(req);
        // No resource IDs, SQL, credentials or deployment destinations can be supplied by clients.
        const allowed = action === "delete" ? ["confirmation"] : [];
        if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(key => !allowed.includes(key))) {
          throw new ProjectFileError(400, "Unexpected request fields.");
        }
        res.json(action === "provision" ? await provisionInfrastructure(userId, id) : await deleteInfrastructure(userId, id, req.body.confirmation));
      } catch (error) { failure(res, error); }
    });
  }
}