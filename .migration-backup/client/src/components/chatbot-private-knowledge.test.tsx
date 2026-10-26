import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn(), invalidate: vi.fn(), query: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.request, queryClient: { invalidateQueries: mocks.invalidate } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
import { ChatbotPrivateKnowledge } from "./chatbot-private-knowledge";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReturnValue({ data: { folder: "chatbots/5/knowledge", backend: "D1", files: [{ path: "knowledge.md", version: 3 }] }, error: null, isLoading: false });
});
describe("owner knowledge folder editor", () => {
  it("saves the draft with the expected revision and applies it explicitly", async () => {
    mocks.request.mockResolvedValue({ json: async () => ({ path: "knowledge.md", content: "approved facts", version: 4 }) });
    render(<ChatbotPrivateKnowledge widgetId={5} draft="approved facts" onDraftChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save Knowledge Base" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("PUT", "/api/chatbots/5/knowledge-files/knowledge.md", { content: "approved facts", version: 3, publish: true }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Knowledge saved and applied" })));
  });
  it("allows editing a privately saved source without implicitly publishing it", async () => {
    const path = `scan-${"a".repeat(32)}.md`;
    mocks.query.mockReturnValue({ data: { folder: "chatbots/5/knowledge", files: [{ path, version: 2 }] } });
    mocks.request.mockResolvedValue({ json: async () => ({ path, content: "original", version: 2 }) });
    const changeDraft = vi.fn();
    render(<ChatbotPrivateKnowledge widgetId={5} draft="existing knowledge" onDraftChange={changeDraft} />);
    fireEvent.click(screen.getByRole("button", { name: /Website scan/ }));
    const editor = await screen.findByLabelText("Saved knowledge file editor");
    fireEvent.change(editor, { target: { value: "edited source" } });
    fireEvent.click(screen.getByRole("button", { name: "Save privately" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("PUT", `/api/chatbots/5/knowledge-files/${path}`, { content: "edited source", version: 2, publish: false }));
    expect(changeDraft).not.toHaveBeenCalled();
  });
  it("shows an explicit storage failure instead of silently saving elsewhere", () => {
    mocks.query.mockReturnValue({ data: undefined, error: new Error("Migration 004 required"), isLoading: false });
    render(<ChatbotPrivateKnowledge widgetId={5} draft="facts" onDraftChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Migration 004 required");
    expect(screen.getByRole("button", { name: "Save Knowledge Base" })).toBeDisabled();
  });
});
