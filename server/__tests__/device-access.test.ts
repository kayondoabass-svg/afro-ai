import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), getUser: vi.fn() }));
vi.mock("../d1", () => ({ d1Query: mocks.query }));
vi.mock("../replit_integrations/auth/storage", () => ({ authStorage: { getUser: mocks.getUser } }));
vi.mock("../replit_integrations/auth/replitAuth", () => ({ isAuthenticated: vi.fn() }));
import { registerDeviceSessionRoutes, validDeviceSession } from "../replit_integrations/auth/deviceSessions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ email: "owner@example.com" });
});
it("rejects legacy/revoked sessions and propagates database failures", async () => {
  expect(await validDeviceSession(undefined, "owner")).toBe(false);
  mocks.query.mockResolvedValue({ results: [] });
  expect(await validDeviceSession("revoked", "owner")).toBe(false);
  mocks.query.mockRejectedValue(new Error("unavailable"));
  await expect(validDeviceSession("active", "owner")).rejects.toThrow("unavailable");
});
it("scopes device deletion to the authenticated account and rejects foreign origins", async () => {
  let remove: any;
  registerDeviceSessionRoutes({ get() {}, delete(_path: string, _auth: any, handler: any) { remove = handler; } } as any);
  const req: any = { user: { claims: { sub: "owner" }, sid: "mine" }, params: { id: "someone-else" }, protocol: "https", get: (name: string) => name === "host" ? "afroaigroup.com" : undefined };
  const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
  mocks.query.mockResolvedValue({ meta: { changes: 0 } });
  await remove(req, res, vi.fn());
  expect(mocks.query.mock.calls[0][1]).toEqual([expect.any(Number), "someone-else", "owner@example.com"]);
  expect(res.status).toHaveBeenCalledWith(404);
  mocks.query.mockClear();
  req.get = (name: string) => name === "origin" ? "https://customer.afroaigroup.com" : "afroaigroup.com";
  await remove(req, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(mocks.query).not.toHaveBeenCalled();
});