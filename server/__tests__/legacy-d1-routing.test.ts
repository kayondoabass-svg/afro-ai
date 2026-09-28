import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { legacyD1Export, legacyD1GetTableInfo, legacyD1GetTableRows, legacyD1ListTables, legacyD1Query, legacyD1Status } from "../legacy-d1";

const originalEnv = { ...process.env };
const identity = { success: true, result: { uuid: "legacy-id", name: "production-db" } };
const queryResult = { success: true, result: [{ results: [{ name: "users" }], meta: {} }] };
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
const fetchMock = vi.fn();

beforeEach(() => {
  process.env.CLOUDFLARE_LEGACY_D1_DATABASE_ID = "legacy-id";
  process.env.LEGACY_D1_DATABASE_NAME = "production-db";
  process.env.CLOUDFLARE_D1_DATABASE_ID = "files-id";
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith("/query") ? reply(queryResult) : url.endsWith("/export") ? reply({ success: true, result: { url: "export-url" } }) : reply(identity));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("legacy D1 routing isolation", () => {
  it("rejects missing configuration, shared file ID, and auth identity before SQL", async () => {
    delete process.env.CLOUDFLARE_LEGACY_D1_DATABASE_ID;
    await expect(legacyD1Query("SELECT 1")).rejects.toMatchObject({ name: "LegacyD1IdentityError" });
    process.env.CLOUDFLARE_LEGACY_D1_DATABASE_ID = "files-id";
    await expect(legacyD1Query("SELECT 1")).rejects.toMatchObject({ name: "LegacyD1IdentityError" });
    process.env.CLOUDFLARE_LEGACY_D1_DATABASE_ID = "e796b2ab-d062-42c2-8412-7d281e4c0f5d";
    await expect(legacyD1Query("SELECT 1")).rejects.toMatchObject({ name: "LegacyD1IdentityError" });
    process.env.CLOUDFLARE_LEGACY_D1_DATABASE_ID = "legacy-id";
    process.env.LEGACY_D1_DATABASE_NAME = "afro-ai-project-files";
    await expect(legacyD1Query("SELECT 1")).rejects.toMatchObject({ name: "LegacyD1IdentityError" });
    delete process.env.LEGACY_D1_DATABASE_NAME;
    await expect(legacyD1Query("SELECT 1")).rejects.toMatchObject({ name: "LegacyD1IdentityError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires exact remote UUID and name, including on status and export", async () => {
    fetchMock.mockResolvedValue(reply({ success: true, result: { uuid: "files-id", name: "production-db" } }));
    await expect(legacyD1Status()).rejects.toMatchObject({ name: "LegacyD1IdentityError" });
    await expect(legacyD1Export()).rejects.toMatchObject({ name: "LegacyD1IdentityError" });
    fetchMock.mockResolvedValue(reply({ success: true, result: { uuid: "legacy-id", name: "unexpected-db" } }));
    await expect(legacyD1Query("SELECT 1")).rejects.toMatchObject({ name: "LegacyD1IdentityError" });
    fetchMock.mockResolvedValue(reply({ success: true, result: { uuid: "legacy-id", name: "afro-ai-auth" } }));
    await expect(legacyD1Query("SELECT 1")).rejects.toMatchObject({ name: "LegacyD1IdentityError" });
    expect(fetchMock.mock.calls.every(([url]) => !url.endsWith("/query") && !url.endsWith("/export"))).toBe(true);
  });

  it("routes console reads, SQL, sync-style writes and export only to verified legacy ID", async () => {
    expect(await legacyD1Status()).toMatchObject({ role: "legacy/general", name: "production-db" });
    await legacyD1ListTables();
    await legacyD1GetTableInfo("users");
    await legacyD1GetTableRows("users");
    await legacyD1Query("CREATE TABLE synced_users (id TEXT)");
    await legacyD1Query("INSERT INTO synced_users (id) VALUES (?)", ["pg-owner-id"]);
    await legacyD1Export();
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(13);
    expect(urls.every(url => url.includes("/d1/database/legacy-id") && !url.includes("files-id"))).toBe(true);
    expect(urls.filter(url => url.endsWith("/query"))).toHaveLength(5);
    expect(urls.filter(url => url.endsWith("/export"))).toHaveLength(1);
  });

  it("never exposes provider metadata error bodies", async () => {
    fetchMock.mockResolvedValue(reply({ success: false, errors: [{ message: "private provider details" }] }, false));
    await expect(legacyD1Query("SELECT 1")).rejects.toThrow("Legacy D1 target is not configured or its identity could not be verified");
  });
});