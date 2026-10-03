import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../db", () => ({ db: { execute: mocks.execute } }));
vi.mock("express-rate-limit", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
import { registerAppInstallRoutes } from "../app-installs";

const routes: Record<string, any[]> = {};
const founder = vi.fn();
registerAppInstallRoutes({
  post: (path: string, ...handlers: any[]) => { routes[`POST ${path}`] = handlers; },
  get: (path: string, ...handlers: any[]) => { routes[`GET ${path}`] = handlers; },
} as any, founder);
function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn(), setHeader: vi.fn() };
}
beforeEach(() => mocks.execute.mockReset().mockResolvedValue({ rows: [{ total: 3 }] }));
it("rejects malformed identifiers before writing anything", async () => {
  const res = response();
  await routes["POST /api/app-installs"].at(-1)({ body: { installationId: "invalid" } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("hashes identifiers and atomically deduplicates retry inserts", async () => {
  const id = "1ac78b49-d323-4e0f-b732-123456789abc";
  const res = response();
  await routes["POST /api/app-installs"].at(-1)({ body: { installationId: id } }, res);
  const statement = new PgDialect().sqlToQuery(mocks.execute.mock.calls.at(-1)![0]);
  expect(statement.sql).toContain("ON CONFLICT (installation_hash) DO NOTHING");
  expect(statement.params[0]).toMatch(/^[a-f0-9]{64}$/);
  expect(statement.params[0]).not.toBe(id);
  expect(res.status).toHaveBeenCalledWith(204);
});
it("restricts the total to founders", async () => {
  expect(routes["GET /api/admin/app-installs"][0]).toBe(founder);
  const res = response();
  await routes["GET /api/admin/app-installs"].at(-1)({}, res);
  expect(res.json).toHaveBeenCalledWith({ total: 3 });
});
it("reports a database outage rather than a false zero", async () => {
  mocks.execute.mockRejectedValueOnce(new Error("offline"));
  const res = response();
  await routes["GET /api/admin/app-installs"].at(-1)({}, res);
  expect(res.status).toHaveBeenCalledWith(503);
});