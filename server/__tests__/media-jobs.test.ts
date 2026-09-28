import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), provider: vi.fn(), store: vi.fn(), remove: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("../replit_integrations/quota", () => ({
  COST_CENTS: { image: 10, video: 200 },
  DAILY_REQUEST_LIMITS: { image: { starter: 5, payg: 1000 }, video: { starter: 0, payg: 50 } },
}));
vi.mock("../imagen", () => ({
  isImagenAvailable: () => true,
  generateImageWithImagen: mocks.provider,
  generateImageWithOpenAIFallback: vi.fn(() => { throw new Error("Must not retry"); }),
}));
vi.mock("../veo", () => ({ isVeoAvailable: () => true, generateVideoWithVeo: mocks.provider }));
vi.mock("../media-assets", async () => ({
  ...await vi.importActual<typeof import("../media-assets")>("../media-assets"),
  storeMedia: mocks.store, deleteStoredMedia: mocks.remove,
}));

import { mediaInput, publicMediaJob, submitMedia, cancelMedia, claimMedia, executeMedia, mediaReady, findMedia, mediaFailureCategory } from "../media-jobs";

const input = { kind: "image", prompt: "A tree", idempotencyKey: "same-key" };
const runningJob = { id: "j", user_id: "u", kind: "image", prompt: "p", duration: null, idempotency_key: "key", lease_token: "lease" };
function client(handler: (sql: string, args?: unknown[]) => any) {
  const c = { query: vi.fn(async (sql: string, args?: unknown[]) => handler(sql, args) ?? { rows: [] }), release: vi.fn() };
  mocks.connect.mockResolvedValue(c);
  return c;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [] });
});
describe("durable media jobs", () => {
  it("validates bounded duration and prompts", () => {
    expect(mediaInput.safeParse({ ...input, duration: 5 }).success).toBe(false);
    expect(mediaInput.safeParse({ ...input, kind: "video", duration: 6 }).success).toBe(false);
    expect(mediaInput.safeParse({ ...input, kind: "video", prompt: "x".repeat(2001) }).success).toBe(false);
    expect(mediaInput.safeParse(input).success).toBe(true);
  });
  it("never exposes internal asset locations or bytes", () => {
    const job = publicMediaJob({ id: "job", kind: "image", status: "succeeded", prompt: "p", created_at: new Date(), asset_key: "secret", asset_bytes: "bytes" });
    expect(job.assetUrl).toBe("/api/media/jobs/job/asset");
    expect(JSON.stringify(job)).not.toContain("secret");
    expect(JSON.stringify(job)).not.toContain("bytes");
  });
  it("fails closed when migration is missing", async () => {
    mocks.query.mockRejectedValue(new Error("relation missing"));
    await expect(mediaReady()).rejects.toMatchObject({ status: 503, code: "MEDIA_MIGRATION_REQUIRED" });
  });
  it("scopes lookup to the authenticated owner and hides unknown IDs", async () => {
    await expect(findMedia("owner", "foreign-job")).rejects.toMatchObject({ status: 404 });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("user_id=$1 AND id=$2"), ["owner", "foreign-job"]);
  });
  it("rolls back quota rejection without debiting or inserting", async () => {
    const c = client(sql => {
      if (sql.includes("FROM users")) return { rows: [{ id: "u", plan: "starter" }] };
      if (sql.includes("FILTER")) return { rows: [{ used: 5, spent: 0 }] };
    });
    await expect(submitMedia("u", input)).rejects.toMatchObject({ code: "DAILY_QUOTA_REACHED" });
    expect(c.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(c.query.mock.calls.some(([sql]) => sql.startsWith("INSERT") || sql.startsWith("UPDATE"))).toBe(false);
  });
  it("returns an existing idempotent job without charging again", async () => {
    const old = { id: "old", kind: "image", prompt: "A tree", duration: null };
    const c = client(sql => {
      if (sql.includes("FROM users")) return { rows: [{ id: "u", plan: "payg" }] };
      if (sql.includes("idempotency_key")) return { rows: [old] };
    });
    expect(await submitMedia("u", input)).toEqual(old);
    expect(c.query.mock.calls.some(([sql]) => sql.startsWith("INSERT") || sql.startsWith("UPDATE"))).toBe(false);
  });
  it("rejects changed input with the same key", async () => {
    client(sql => {
      if (sql.includes("FROM users")) return { rows: [{ id: "u" }] };
      if (sql.includes("idempotency_key")) return { rows: [{ kind: "video" }] };
    });
    await expect(submitMedia("u", input)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("reserves PAYG, usage and job within one transaction", async () => {
    const c = client(sql => {
      if (sql.includes("FROM users")) return { rows: [{ id: "u", plan: "payg", payg_balance: 20, payg_limit: 100 }] };
      if (sql.includes("FILTER")) return { rows: [{ used: 0, spent: 0 }] };
      if (sql.includes("INSERT INTO usage_logs")) return { rows: [{ id: 9 }] };
      if (sql.includes("INSERT INTO media_jobs")) return { rows: [{ id: "new" }] };
    });
    expect(await submitMedia("u", input)).toEqual({ id: "new" });
    const calls = c.query.mock.calls.map(([sql]) => sql);
    expect(calls[0]).toBe("BEGIN");
    expect(calls.at(-1)).toBe("COMMIT");
    expect(calls.filter(sql => sql.includes("payg_balance=payg_balance-"))).toHaveLength(1);
  });
  it("does not refund running cancellation", async () => {
    const c = client(sql => sql.includes("FROM media_jobs") ? { rows: [{ id: "j", status: "running", plan: "payg" }] } : undefined);
    expect((await cancelMedia("u", "j")).status).toBe("cancelled");
    expect(c.query.mock.calls.some(([sql]) => sql.includes("DELETE") || sql.includes("payg_balance"))).toBe(false);
  });
  it("refunds queued cancellation and does not refund terminal cancellation", async () => {
    const c = client(sql => sql.includes("FROM media_jobs") ? { rows: [{ id: "j", status: "queued", plan: "payg", usage_log_id: 3, cost_cents: 10 }] } : undefined);
    await cancelMedia("u", "j");
    expect(c.query.mock.calls.some(([sql]) => sql.includes("DELETE FROM usage_logs"))).toBe(true);
    const c2 = client(sql => sql.includes("FROM media_jobs") ? { rows: [{ id: "j", status: "cancelled" }] } : undefined);
    await cancelMedia("u", "j");
    expect(c2.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE") || sql.startsWith("DELETE"))).toBe(false);
  });
  it("enforces global concurrency and fails expired jobs without requeueing", async () => {
    const c = client(sql => sql.includes("count(*)") ? { rows: [{ n: 4 }] } : undefined);
    expect(await claimMedia()).toBeUndefined();
    const calls = c.query.mock.calls.map(([sql]) => sql);
    expect(calls.some(sql => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(calls.some(sql => sql.includes("status='failed'") && sql.includes("lease_until < now()"))).toBe(true);
    expect(calls.some(sql => sql.includes("SET status='queued'"))).toBe(false);
    expect(calls.some(sql => sql.includes("SKIP LOCKED"))).toBe(false);
  });
  it("sanitizes provider errors and never automatically retries", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: "j" }] });
    mocks.provider.mockRejectedValue(new Error("secret provider URL and key"));
    await executeMedia(runningJob);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    expect(mocks.store).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain("secret provider");
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("status='failed'"))).toBe(true);
  });
  it("requires legacy callers to supply an idempotency key too", () => {
    expect(mediaInput.safeParse({ kind: "image", prompt: "p" }).success).toBe(false);
  });
  it("never submits invalid persisted video durations", async () => {
    await executeMedia({ ...runningJob, kind: "video", duration: 9 });
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.query.mock.calls)).toContain("MEDIA_INVALID_JOB");
  });
  it("does not store an asset after its lease expires or token changes", async () => {
    mocks.provider.mockResolvedValue({ b64_json: "aGk=", mimeType: "image/png" });
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "j" }] }).mockResolvedValueOnce({ rows: [] });
    await executeMedia(runningJob);
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[1]).toEqual([
      expect.stringContaining("lease_token=$3 AND status='running' AND lease_until > now()"),
      ["j", "u", "lease"],
    ]);
  });
  it("cleans private R2 output when final update loses cancellation/fencing race", async () => {
    mocks.provider.mockResolvedValue({ b64_json: "aGk=", mimeType: "image/png" });
    mocks.store.mockResolvedValue({ key: "bucket/private-media/j/lease", bytes: null });
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "j" }] })
      .mockResolvedValueOnce({ rows: [{ id: "j" }] }).mockResolvedValueOnce({ rows: [] });
    await executeMedia(runningJob);
    expect(mocks.store).toHaveBeenCalledWith("j/lease", Buffer.from("hi"), "image/png");
    expect(mocks.remove).toHaveBeenCalledWith("bucket/private-media/j/lease");
    expect(mocks.query.mock.calls[2][0]).toContain("AND lease_until > now()");
  });
  it("does not delete output after a potentially committed DB response failure", async () => {
    mocks.provider.mockResolvedValue({ b64_json: "aGk=", mimeType: "image/png" });
    mocks.store.mockResolvedValue({ key: "bucket/private-media/j/lease", bytes: null });
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "j" }] })
      .mockResolvedValueOnce({ rows: [{ id: "j" }] }).mockRejectedValueOnce(new Error("connection lost"));
    await executeMedia(runningJob);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("persists only allowlisted failure categories", () => {
    expect(mediaFailureCategory({ status: 429, message: "secret" })).toBe("MEDIA_PROVIDER_RATE_LIMIT");
    expect(mediaFailureCategory({ status: 403 })).toBe("MEDIA_PROVIDER_AUTH");
    expect(mediaFailureCategory({ code: "secret", message: "secret" })).toBe("MEDIA_GENERATION_FAILED");
    expect(mediaFailureCategory(new Error("secret"), true)).toBe("MEDIA_PROVIDER_TIMEOUT");
  });
});