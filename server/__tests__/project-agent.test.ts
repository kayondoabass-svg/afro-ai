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
vi.mock("../project-workbench/service", () => ({ captureProjectCheckpoint: vi.fn() }));

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
  it("reads bounded ranges, retrieves context, and proposes reviewed patches for large files", () => {
    const content = "long line\n".repeat(3000) + "unique";
    const session = projectToolSession([file(content)]);
    expect(() => session.execute("read_file", { path: "src/app.ts" })).toThrow("16 KB");
    expect(session.execute("read_file", { path: "src/app.ts", startLine: 3001, endLine: 3001 })).toMatchObject({ content: "unique", startLine: 3001 });
    expect(session.execute("search_context", { query: "unique" })).toMatchObject({ untrusted: true });
    expect(session.execute("propose_operations", { operations: [{ kind: "patch", path: "src/app.ts", find: "unique", replace: "fixed" }] })).toMatchObject({ saved: false });
    expect(session.operations).toHaveLength(1);
  });
  it.each(["gemini", "openai"])("preserves tool messages and aggregates usage across %s calls", async provider => {
    mocks.complete.mockResolvedValueOnce({
      text: "", model: "test-model", provider, promptTokens: 20, completionTokens: 5,
      toolCalls: [{ id: "r1", type: "function", function: { name: "read_file", arguments: '{"path":"src/app.ts"}' } }],
    }).mockResolvedValueOnce({ text: "Reviewed.", model: "test-model", provider, promptTokens: 25, completionTokens: 5 });
    const result = await runProjectTools({ files: [file()], request: "Review the source", signal: new AbortController().signal, onActivity: vi.fn() });
    expect(result.tokensUsed).toBe(55); expect(result.usageEstimated).toBe(false);
    expect(mocks.complete.mock.calls[1][0].messages.some((m: any) => m.role === "tool" && m.tool_call_id === "r1")).toBe(true);
  });
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
    // Changing the last base64url character can alter only unused padding bits.
    // Change the first signature character so the decoded HMAC definitely differs.
    const [body, signature] = proposal.token.split(".");
    const tampered = `${body}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    expect(() => verifyProjectProposal(tampered, "owner", "1")).toThrow();
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