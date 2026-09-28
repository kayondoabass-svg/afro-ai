import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  query: vi.fn(),
  conversation: vi.fn(),
  messages: vi.fn(),
  createMessage: vi.fn(),
  connect: vi.fn(),
}));
vi.mock("../ai-chat-provider", () => ({ aiChatComplete: mocks.complete }));
vi.mock("../d1", () => ({ d1Query: mocks.query, isD1Configured: () => true }));
vi.mock("../replit_integrations/chat/storage", () => ({
  chatStorage: { getConversation: mocks.conversation, getMessagesByConversation: mocks.messages, createMessage: mocks.createMessage },
}));
vi.mock("../db", () => ({ pool: { connect: mocks.connect } }));

import { projectToolSession, runProjectTools } from "../project-tools";
import { applyProjectFileChanges } from "../project-files";
import { createProjectProposal, finishProjectProposal, verifyProjectProposal } from "../project-proposals";

const file = (content = "original", path = "src/app.ts") =>
  ({ path, name: path.split("/").at(-1)!, language: "typescript", content });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SESSION_SECRET = "test-signature-only";
  mocks.conversation.mockResolvedValue({ userId: "owner" });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("sqlite_master")) return { results: [{ name: "project_file_command_apply" }] };
    if (sql.includes("SELECT * FROM project_files")) return { results: [file()] };
    return { results: [{ id: 1 }] };
  });
});

describe("bounded read-only tools", () => {
  it("lists, reads and searches literally without host filesystem access", () => {
    const session = projectToolSession([file("a.b\nabc")]);
    expect(session.execute("list_files", {})).toEqual({ paths: ["src/app.ts"], nextOffset: null, binaryFilesExcluded: 0 });
    expect(session.execute("search_files", { query: "a.b" })).toMatchObject({ matches: [{ line: 1 }] });
    expect(session.execute("search_files", { query: "a.*" })).toMatchObject({ matches: [] });
    expect(() => session.execute("read_file", { path: "../secret" })).toThrow();
    expect(session.execute("read_file", { path: "src/app.ts" })).toEqual(file("a.b\nabc"));
    expect(() => session.execute("propose_edits", { files: [{ path: "src/app.ts", language: "typescript", content: "a.b\nabc" }] })).toThrow("unchanged");
    expect(session.execute("propose_edits", { files: [{ path: "src/app.ts", language: "typescript", content: "updated" }] })).toEqual({ proposedPaths: ["src/app.ts"], saved: false });
    expect(() => session.execute("propose_edits", { files: [{ path: "src/new.ts", language: "typescript", content: "new" }] })).toThrow("one proposal");
  });

  it("limits calls and propagates cancellation without proposals", async () => {
    const activity = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(runProjectTools({ files: [file()], request: "edit", signal: controller.signal, onActivity: activity })).rejects.toThrow();
    expect(mocks.complete).not.toHaveBeenCalled();
    mocks.complete.mockResolvedValue({ text: "", toolCalls: Array.from({ length: 4 }, (_, i) => ({
      id: String(i), type: "function", function: { name: "list_files", arguments: "{}" },
    })) });
    await expect(runProjectTools({ files: [file()], request: "edit", signal: new AbortController().signal, onActivity: activity })).rejects.toThrow("limit");
  });
});

describe("signed review and atomic apply", () => {
  it("checks ownership, expiry, tampering and issued token", async () => {
    mocks.createMessage.mockResolvedValue({ id: 1 });
    const proposal = await createProjectProposal("owner", "1", [{ before: file(), file: file("updated") }]);
    expect(verifyProjectProposal(proposal.token, "owner", "1").changes).toHaveLength(1);
    expect(() => verifyProjectProposal(proposal.token, "other", "1")).toThrow("ownership");
    expect(() => verifyProjectProposal(proposal.token.slice(0, -1) + "x", "owner", "1")).toThrow();
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(16 * 60_000);
      expect(() => verifyProjectProposal(proposal.token, "owner", "1")).toThrow("expired");
    } finally { vi.useRealTimers(); }
    const connection = { query: vi.fn(async (sql: string) =>
      sql.includes("role = 'project-proposal'") ? { rows: [] } : { rows: [] }), release: vi.fn() };
    mocks.connect.mockResolvedValue(connection);
    await expect(finishProjectProposal("owner", "1", proposal.token, false)).rejects.toThrow("not found");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("fails stale edits atomically with one conditional command and never writes noops", async () => {
    await expect(applyProjectFileChanges("owner", "1", [{ before: file(), file: file() }])).rejects.toThrow("invalid prior");
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("sqlite_master")) return { results: [{ name: "project_file_command_apply" }] };
      if (sql.includes("SELECT * FROM project_files")) return { results: [file()] };
      if (sql.includes("INSERT INTO project_file_commands")) return { results: [] };
      return { results: [] };
    });
    await expect(applyProjectFileChanges("owner", "1", [{ before: file(), file: file("updated") }])).rejects.toThrow("stale");
    const insert = mocks.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO project_file_commands"));
    expect(insert).toHaveLength(1);
    expect(insert[0][0]).toContain("WHERE EXISTS");
    expect(insert[0][0]).toContain("RETURNING id");
  });

  it("records attempts before applying, rejects replay after a failed attempt and cancels idempotently", async () => {
    mocks.createMessage.mockResolvedValue({ id: 1 });
    const proposal = await createProjectProposal("owner", "1", [{ before: file(), file: file("updated") }]);
    let receipt: string | undefined;
    const connection = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes("role = 'project-proposal'")) return { rows: [{ "?column?": 1 }] };
        if (sql.includes("role = 'project-proposal-receipt'")) return { rows: receipt ? [{ content: receipt }] : [] };
        if (sql.includes("INSERT INTO messages")) {
          receipt = params[1] as string;
          return { rows: [{ id: 7 }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(connection);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("sqlite_master")) return { results: [{ name: "project_file_command_apply" }] };
      if (sql.includes("SELECT * FROM project_files")) return { results: [file()] };
      if (sql.includes("INSERT INTO project_file_commands")) return { results: [] };
      return { results: [] };
    });
    await expect(finishProjectProposal("owner", "1", proposal.token, false)).rejects.toThrow("stale");
    expect(JSON.parse(receipt!).status).toBe("attempted");
    await expect(finishProjectProposal("owner", "1", proposal.token, false)).rejects.toThrow("already cancelled or attempted");
    expect(mocks.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO project_file_commands"))).toHaveLength(1);
    receipt = undefined;
    expect(await finishProjectProposal("owner", "1", proposal.token, true)).toEqual({ cancelled: true });
    expect(await finishProjectProposal("owner", "1", proposal.token, true)).toEqual({ cancelled: true });
  });
});