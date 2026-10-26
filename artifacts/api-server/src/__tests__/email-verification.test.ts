import { beforeEach, describe, expect, it, vi } from "vitest";
import { users, emailVerificationTokens } from "@shared/models/auth";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), send: vi.fn(), welcome: vi.fn(), getUser: vi.fn(),
}));
vi.mock("../db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("../mailer", () => ({ sendEmailVerification: mocks.send, sendWelcomeEmail: mocks.welcome }));
vi.mock("../replit_integrations/auth/storage", () => ({ authStorage: { getUser: mocks.getUser } }));
vi.mock("../storage", () => ({ storage: {} }));
import { sendVerificationEmailFor, verifyEmailToken } from "../replit_integrations/auth/verification";
import { isAuthenticated, isSignedIn } from "../replit_integrations/auth/replitAuth";

let user: any;
let tokens: any[];
beforeEach(() => {
  vi.clearAllMocks();
  user = { id: "test-user", email: "test@example.com", firstName: "Test", emailVerified: null };
  tokens = [];
  mocks.send.mockResolvedValue(true);
  mocks.welcome.mockResolvedValue(true);
  mocks.getUser.mockImplementation(async () => user);
  // Model the transaction's row lock, including concurrent first-page requests.
  let queue = Promise.resolve();
  mocks.transaction.mockImplementation((fn) => {
    const result = queue.then(() => fn({
      select: () => ({ from: (table: any) => {
        const rows = () => table === users ? [user] : tokens.slice(-1);
        const query: any = {
          where: () => query, for: async () => rows(), orderBy: () => query,
          limit: async () => rows(),
        };
        return query;
      } }),
      insert: () => ({ values: async (row: any) => { tokens.push(row); } }),
      update: (table: any) => ({ set: (values: any) => ({ where: async () => {
        Object.assign(table === users ? user : tokens[tokens.length - 1], values);
      } }) }),
    }));
    queue = result.then(() => undefined, () => undefined);
    return result;
  });
});

describe("verification email lifecycle", () => {
  const send = (automatic = true) => sendVerificationEmailFor(user.id, user.email, "Test", "https://example.com", automatic);
  it("eight concurrent signup requests send exactly one email with a backend token link", async () => {
    await Promise.all(Array.from({ length: 8 }, () => send()));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const url = new URL(mocks.send.mock.calls[0][1].verifyUrl);
    expect(url.pathname).toBe("/api/auth/verify-email");
    expect(url.searchParams.get("token")).toBeTruthy();
    expect(mocks.welcome).not.toHaveBeenCalled();
  });
  it("throttles concurrent manual resends and permits an explicit resend after a minute", async () => {
    await send();
    expect(await send(false)).toBe("throttled");
    tokens[0].createdAt = new Date(Date.now() - 61_000);
    await Promise.all([send(false), send(false)]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
  it("does not automatically resend an old token or hide delivery failures", async () => {
    mocks.send.mockResolvedValue(false);
    await expect(send()).rejects.toThrow("delivery failed");
    tokens[0].createdAt = new Date(Date.now() - 61_000);
    expect(await send()).toBe("throttled");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("verifies once and sends only one welcome despite repeated clicks", async () => {
    await send();
    const token = new URL(mocks.send.mock.calls[0][1].verifyUrl).searchParams.get("token")!;
    expect(await verifyEmailToken(token)).toBe("ok");
    expect(user.emailVerified).toBeInstanceOf(Date);
    expect(await verifyEmailToken(token)).toBe("used");
    expect(mocks.welcome).toHaveBeenCalledTimes(1);
    expect(await send(false)).toBe("alreadyVerified");
  });
  it("rejects missing, unknown, expired, and changed-email tokens", async () => {
    expect(await verifyEmailToken("")).toBe("missing");
    expect(await verifyEmailToken("unknown")).toBe("invalid");
    await send();
    tokens[0].expiresAt = new Date(Date.now() - 1);
    expect(await verifyEmailToken("expired")).toBe("expired");
    tokens[0].email = "old@example.com";
    expect(await verifyEmailToken("old-email")).toBe("invalid");
    expect(user.emailVerified).toBeNull();
    expect(mocks.welcome).not.toHaveBeenCalled();
  });
});

describe("account access", () => {
  function request(signedIn = true) {
    return { isAuthenticated: () => signedIn, user: { claims: { sub: user.id } } } as any;
  }
  function response() {
    const res: any = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    return res;
  }
  it("blocks unverified users on protected APIs but allows identity/resend access", async () => {
    const res = response(), next = vi.fn();
    await isAuthenticated(request(), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    await isSignedIn(request(), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
  it("allows verified users and rejects anonymous requests", async () => {
    const next = vi.fn(), res = response();
    user.emailVerified = new Date();
    await isAuthenticated(request(), res, next);
    expect(next).toHaveBeenCalledOnce();
    await isAuthenticated(request(false), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});