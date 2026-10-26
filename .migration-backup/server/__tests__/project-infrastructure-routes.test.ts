import express from "express";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Server } from "node:http";
const m = vi.hoisted(() => ({ provision: vi.fn(), remove: vi.fn(), view: vi.fn() }));
vi.mock("../replit_integrations/auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    if (req.headers.authorization !== "test-owner") return res.status(401).json({});
    req.user = { claims: { sub: "owner" } }; next();
  },
}));
vi.mock("../project-infrastructure/service", () => ({
  provisionInfrastructure: m.provision, deleteInfrastructure: m.remove, infrastructureView: m.view,
}));
import { registerProjectInfrastructureRoutes } from "../project-infrastructure/routes";
let server: Server, url: string;
beforeAll(async () => {
  m.provision.mockResolvedValue({ state: "ready", hosting: { available: false } });
  const app = express(); app.use(express.json()); registerProjectInfrastructureRoutes(app);
  server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
it("requires authentication before infrastructure operations", async () => {
  const response = await fetch(`${url}/api/projects/12/infrastructure`);
  expect(response.status).toBe(401);
  expect(m.view).not.toHaveBeenCalled();
});
it("rejects customer subdomains and missing Origin on paid mutations", async () => {
  for (const origin of ["https://customer.afroaigroup.com", "https://afroaigroup.com.attacker.test", "null", ""]) {
    const response = await fetch(`${url}/api/projects/12/infrastructure/provision`, {
      method: "POST", headers: { authorization: "test-owner", "content-type": "application/json", origin }, body: "{}",
    });
    expect(response.status).toBe(403);
  }
  expect(m.provision).not.toHaveBeenCalled();
});
it("rejects caller-selected resources, ownership and SQL", async () => {
  const response = await fetch(`${url}/api/projects/12/infrastructure/provision`, {
    method: "POST", headers: { authorization: "test-owner", "content-type": "application/json", origin: "https://afroaigroup.com" },
    body: JSON.stringify({ userId: "victim", databaseId: "victim-id", sql: "DROP TABLE users" }),
  });
  expect(response.status).toBe(400);
});
it("uses the authenticated identity, with server-selected resources", async () => {
  const response = await fetch(`${url}/api/projects/12/infrastructure/provision`, {
    method: "POST", headers: { authorization: "test-owner", "content-type": "application/json", origin: "https://afroaigroup.com" }, body: "{}",
  });
  expect(response.status).toBe(200);
  expect(m.provision).toHaveBeenCalledWith("owner", 12);
});