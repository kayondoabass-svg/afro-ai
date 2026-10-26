// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getConversation: vi.fn(), archive: vi.fn() }));
vi.mock("./replit_integrations/chat/storage", () => ({ chatStorage: { getConversation: mocks.getConversation } }));
vi.mock("./project-workbench/activity-history", () => ({ archiveActivities: mocks.archive }));
import { recordChatExecutionActivity } from "./chat-execution-activity";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConversation.mockResolvedValue({ id: 12, userId: "owner" });
  mocks.archive.mockResolvedValue(undefined);
});
it("archives ordinary website actions in the existing conversation ledger", async () => {
  const started = await recordChatExecutionActivity("owner", 12, "job-one", "save_project_files", "started", "Saving index.html", ["index.html"]);
  const finished = await recordChatExecutionActivity("owner", 12, "job-one", "save_project_files", "succeeded", "Saved index.html", ["index.html"]);
  expect(started.callId).toBe(finished.callId);
  expect(started.id).not.toBe(finished.id);
  expect(finished.persisted).toBe(true);
  expect(mocks.archive).toHaveBeenLastCalledWith("12", [expect.objectContaining({ tool: "save_project_files", status: "succeeded", paths: ["index.html"] })]);
});
it("keeps different turns separate so action counts do not merge unrelated saves", async () => {
  const first = await recordChatExecutionActivity("owner", 12, "first", "generate_website", "succeeded", "Generated website code");
  const next = await recordChatExecutionActivity("owner", 12, "next", "generate_website", "succeeded", "Generated website code");
  expect(first.callId).not.toBe(next.callId);
  expect(first.jobId).not.toBe(next.jobId);
});
it("does not access another customer's activity ledger", async () => {
  mocks.getConversation.mockResolvedValue({ id: 12, userId: "someone-else" });
  await expect(recordChatExecutionActivity("owner", 12, "job-one", "generate_website", "succeeded", "Generated website code")).rejects.toMatchObject({ status: 404 });
  expect(mocks.archive).not.toHaveBeenCalled();
});
it("reports unavailable persistence without inventing a file-write failure", async () => {
  mocks.archive.mockRejectedValue(new Error("unavailable"));
  const event = await recordChatExecutionActivity("owner", 12, "job-one", "save_project_files", "succeeded", "Saved index.html");
  expect(event.status).toBe("succeeded");
  expect(event.persisted).toBe(false);
  expect(event.message).toContain("history could not be saved");
  expect(event.message).not.toContain("unavailable");
});
