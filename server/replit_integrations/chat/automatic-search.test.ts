import { it, expect, vi, beforeEach } from "vitest";
const { model, web, files } = vi.hoisted(() => ({ model: vi.fn(), web: vi.fn(), files: vi.fn() }));
vi.mock("../../ai-chat-provider", () => ({ aiChatComplete: model }));
vi.mock("./search", async importOriginal => ({ ...await importOriginal<any>(), runChatSearch: web }));
vi.mock("../../workspace-search", () => ({ searchWorkspaceFiles: files }));
import { completeWithAutomaticSearch } from "./automatic-search";
const call = (name: string, args = '{"query":"auth middleware"}', id = "1") => ({ id, type: "function", function: { name, arguments: args } });
const opts = () => ({ messages: [{ role: "user" as const, content: "Where is our auth middleware?" }], signal: new AbortController().signal, onActivity: vi.fn(), workspace: { userId: "owner", conversationId: 42 } });
beforeEach(() => { model.mockReset(); web.mockReset(); files.mockReset(); });
it("executes internal file search and feeds correlated results to the final answer", async () => {
  model.mockResolvedValueOnce({ text: "internal", toolCalls: [call("search_workspace_files")] }).mockResolvedValueOnce({ text: "See auth.ts:1.", model: "test", completionTokens: 4 });
  files.mockResolvedValue({ results: [{ path: "auth.ts", startLine: 1, content: "auth" }] });
  expect((await completeWithAutomaticSearch(opts())).fullText).toBe("See auth.ts:1.");
  expect(files).toHaveBeenCalledWith("owner", 42, "auth middleware");
  expect(web).not.toHaveBeenCalled();
  expect(model.mock.calls[1][0].messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "1" });
});
it.each(['{broken', '{"query":"contact bob@example.org"}', '{"query":"news","projectId":123}'])("rejects malformed or unsafe web arguments: %s", async args => {
  model.mockResolvedValueOnce({ toolCalls: [call("search_web", args)] }).mockResolvedValueOnce({ text: "Please clarify.", model: "test" });
  await completeWithAutomaticSearch(opts());
  expect(web).not.toHaveBeenCalled();
  expect(model.mock.calls[1][0].messages.at(-1).content).toContain("Invalid or unsafe");
});
it("supports multiple calls with one assistant message and a result for each ID", async () => {
  model.mockResolvedValueOnce({ toolCalls: [call("search_web", '{"query":"current news"}'), call("search_workspace_files", undefined, "2")] })
    .mockResolvedValueOnce({ text: "Answer", model: "test" });
  web.mockResolvedValue({ status: "empty", sources: [] });
  files.mockResolvedValue({ results: [] });
  await completeWithAutomaticSearch(opts());
  const messages = model.mock.calls[1][0].messages;
  expect(messages.filter((m: any) => m.tool_calls)).toHaveLength(1);
  expect(messages.filter((m: any) => m.role === "tool").map((m: any) => m.tool_call_id)).toEqual(["1", "2"]);
});
it("forces final synthesis after bounded tool rounds", async () => {
  model.mockResolvedValueOnce({ toolCalls: [call("search_workspace_files")] })
    .mockResolvedValueOnce({ toolCalls: [call("search_workspace_files", undefined, "2")] })
    .mockResolvedValueOnce({ text: "Final", model: "test" });
  files.mockResolvedValue({ results: [] });
  await completeWithAutomaticSearch(opts());
  expect(model.mock.calls.map(([o]) => o.toolChoice)).toEqual(["auto", "auto", "none"]);
});
it("stops before inference when disconnected", async () => {
  const input = opts();
  input.signal = AbortSignal.abort();
  await expect(completeWithAutomaticSearch(input)).rejects.toThrow();
  expect(model).not.toHaveBeenCalled();
});