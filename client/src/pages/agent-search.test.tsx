import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/pages/ai-chat", () => ({ PublishDialog: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({
  t: (key: string) => key,
}) }));
vi.mock("wouter", () => ({ useLocation: () => ["/chat", vi.fn()] }));
vi.mock("@/components/file-tree-sidebar", () => ({ FileTreeSidebar: () => <div>Project file tree</div> }));
vi.mock("@/components/fullstack-infrastructure", () => ({ FullstackInfrastructure: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "/api/auth/user" ? { firstName: "Test" } : queryKey[2] === "project-proposal" ? null : [],
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

import AgentPage from "./agent";

afterEach(() => vi.unstubAllGlobals());

const activity = {
  type: "web-search", status: "success", query: "Uganda event",
  sources: [{ title: "Official event", url: "https://example.org/event", snippet: "Event info", retrievedAt: "2026-05-01" }],
};

describe("active /chat Agent search", () => {
  it("keeps builder modes exclusive and exposes review and navigation through the mobile menu", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/conversations") return Response.json({ id: 47 });
      throw new Error(`Unexpected request ${url}`);
    }));
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    render(<AgentPage />);
    expect(screen.getByTestId("agent-shell")).toHaveClass("agent-shell");
    expect(screen.getByTestId("agent-messages")).toHaveClass("agent-scroll");
    fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
    fireEvent.click(screen.getByTestId("button-project-agent"));
    expect(screen.getByRole("button", { name: "Search the web" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("button-project-agent")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("checkbox-plan-mode"));
    expect(screen.getByTestId("button-project-agent")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("checkbox-plan-mode")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("button-mobile-menu"));
    expect(await screen.findByRole("button", { name: "Project files & review" })).toBeInTheDocument();
    expect(screen.getByTestId("button-mobile-project-agent")).toHaveAttribute("aria-pressed", "false");
  });
  it("opts into review-only project tools and displays actual activity", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/conversations" && init?.method === "POST") return Response.json({ id: 45 });
      if (url === "/api/conversations/45/messages") return new Response(
        `data: ${JSON.stringify({ type: "project-tool", tool: "list_files", callId: "1", status: "completed" })}\n\n` +
        `data: ${JSON.stringify({ type: "text", content: "No edits needed." })}\n\n` +
        `data: ${JSON.stringify({ done: true })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
      if (url === "/api/conversations/45") return Response.json({ messages: [
        { id: 1, role: "assistant", content: "No edits needed." },
      ] });
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    render(<AgentPage />);
    fireEvent.click(screen.getByTestId("button-project-agent"));
    fireEvent.change(screen.getByTestId("input-prompt"), { target: { value: "Review my project" } });
    fireEvent.click(screen.getByTestId("button-send"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/45/messages", expect.objectContaining({
        body: JSON.stringify({ content: "Review my project", webSearch: false, projectAgent: true }),
      }),
    ));
    await waitFor(() => expect(screen.getByText("list_files: completed")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Project activity/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /Project activity/ }));
    expect(screen.getByText("list files")).toBeInTheDocument();
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });
  it("sends explicit opt-in, displays server activity, and restores persisted citations from history", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/conversations" && init?.method === "POST") return Response.json({ id: 42 });
      if (url === "/api/conversations/42/messages") return new Response(
        `data: ${JSON.stringify({ ...activity, status: "searching", sources: [] })}\n\n` +
        `data: ${JSON.stringify(activity)}\n\n` +
        `data: ${JSON.stringify({ content: "Here is the event [1]." })}\n\n` +
        `data: ${JSON.stringify({ done: true })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
      if (url === "/api/conversations/42") return Response.json({ messages: [
        { id: 1, role: "user", content: "Uganda event" },
        { id: 2, role: "web-search", content: JSON.stringify(activity) },
        { id: 3, role: "assistant", content: "Here is the event [1]." },
      ] });
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    render(<AgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
    expect(screen.getByRole("button", { name: "Search the web" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByTestId("input-prompt"), { target: { value: "Uganda event" } });
    await waitFor(() => expect(screen.getByTestId("button-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("button-send"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/42/messages", expect.objectContaining({
        body: JSON.stringify({ content: "Uganda event", webSearch: true }),
      }),
    ));
    const citation = await screen.findByRole("link", { name: "1. Official event" });
    expect(citation).toHaveAttribute("href", "https://example.org/event");
    expect(screen.getByText("Here is the event [1].")).toBeVisible();
    expect(screen.getAllByTestId("chat-search-activity")).toHaveLength(1);
  });

  it("aborts in-flight search and does not append a fake answer", async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/conversations" && init?.method === "POST") return Response.json({ id: 43 });
      if (url === "/api/conversations/43/messages") {
        signal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    render(<AgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
    fireEvent.change(screen.getByTestId("input-prompt"), { target: { value: "Uganda event" } });
    fireEvent.click(screen.getByTestId("button-send"));
    await waitFor(() => expect(screen.getByTestId("button-stop")).toBeInTheDocument());
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByTestId("button-stop"));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("button-stop")).not.toBeInTheDocument());
    expect(screen.queryByText("chat.noResponse")).not.toBeInTheDocument();
    expect(screen.queryByTestId("progress-steps")).not.toBeInTheDocument();
  });
});