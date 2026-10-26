// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../db", () => ({ db: { transaction: mock.transaction } }));
import { saveScan } from "../chatbot-scan-persistence";
import { chatbotQas, chatbotScannedPages, chatbotWidgets } from "@shared/schema";
const scan = {
  pagesScanned: 1, qasExtracted: 1, qasSensitive: 0, qasDeduped: 0, topics: ["Services"],
  rows: [{ widgetId: 5, question: "What services are offered?", answer: "Tax filing", topic: "Services", sourceUrl: "https://shop.example", sourceHash: "new", included: true }],
  pageHashes: [{ url: "https://shop.example", hash: "new" }],
};
let operations: string[];
let failPage: boolean;
let known: any[];
let existing: any[];
let updates: any[];
beforeEach(() => {
  operations = []; failPage = false; known = []; existing = []; updates = [];
  const tx: any = {
    select: () => {
      let table: unknown;
      const query: any = {
        from: (t: unknown) => { table = t; return query; },
        where: () => query,
        for: (lock: string) => { operations.push(`lock:${lock}`); return query; },
        then: (resolve: any, reject: any) => Promise.resolve(table === chatbotWidgets ? [{ id: 5 }] : table === chatbotScannedPages ? known : existing).then(resolve, reject),
      };
      return query;
    },
    insert: (table: unknown) => ({
      values: async () => {
        operations.push(table === chatbotQas ? "insert-qa" : "insert-page");
        if (table === chatbotScannedPages && failPage) throw new Error("Page write failed");
      },
    }),
    update: (table: unknown) => ({
      set: (value: unknown) => {
        updates.push({ table, value });
        return { where: () => table === chatbotScannedPages ? { returning: async () => [] } : Promise.resolve() };
      },
    }),
    delete: () => ({ where: async () => { operations.push("delete-qas"); } }),
  };
  mock.transaction.mockImplementation(async fn => {
    try { const result = await fn(tx); operations.push("commit"); return result; }
    catch (error) { operations.push("rollback"); throw error; }
  });
});
describe("atomic customer scan persistence", () => {
  it("locks the widget and writes answers + hashes in one transaction without an ON CONFLICT index", async () => {
    expect(await saveScan(5, scan, "incremental")).toEqual({ inserted: 1, skipped: 0 });
    expect(operations).toEqual(["lock:update", "insert-qa", "insert-page", "commit"]);
  });
  it("rolls back the Q&A write if its page-hash write fails", async () => {
    failPage = true;
    await expect(saveScan(5, scan, "incremental")).rejects.toThrow("Page write failed");
    expect(operations).toEqual(["lock:update", "insert-qa", "insert-page", "rollback"]);
  });
  it("does not delete existing knowledge on an empty replace scan", async () => {
    await expect(saveScan(5, { ...scan, rows: [] }, "replace")).rejects.toThrow("No usable");
    expect(operations).toEqual([]);
  });
  it("rejects cross-widget rows and cancelled scans", async () => {
    await expect(saveScan(5, { ...scan, rows: [{ ...scan.rows[0], widgetId: 6 }] }, "incremental")).rejects.toThrow("ownership");
    const controller = new AbortController(); controller.abort();
    await expect(saveScan(5, scan, "replace", controller.signal)).rejects.toThrow("cancelled");
    expect(operations).not.toContain("delete-qas");
  });
  it("skips unchanged content", async () => {
    known = [{ url: "https://shop.example", contentHash: "new" }];
    expect(await saveScan(5, scan, "incremental")).toEqual({ inserted: 0, skipped: 1 });
    expect(operations).not.toContain("insert-qa");
  });
  it("keeps owner exclusions while updating matching scanned answers", async () => {
    existing = [{ id: 12, included: false }];
    await saveScan(5, scan, "incremental");
    expect(updates.find(u => u.table === chatbotQas).value).toEqual(expect.objectContaining({ answer: "Tax filing", included: false, embedding: null }));
    expect(operations).not.toContain("insert-qa");
  });
});
