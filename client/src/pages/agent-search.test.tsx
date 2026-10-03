import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/pages/ai-chat", () => ({
  PublishDialog: ({ open, code, onOpenChange }: { open: boolean; code: string; onOpenChange: (open: boolean) => void }) => open
    ? <div data-testid="publish-dialog">{code}<button onClick={() => onOpenChange(false)}>Close publish</button></div> : null,
}));
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
    expect(screen.queryByRole("button", { name: "Search the web" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-project-agent"));
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
        body: JSON.stringify({ content: "Review my project", projectAgent: true }),
      }),
    ));
    await waitFor(() => expect(screen.getByText("list_files: completed")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Project activity/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /Project activity/ }));
    expect(screen.getByText("list files")).toBeInTheDocument();
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });
  it("sends no search preference, displays server activity, and restores persisted citations from history", async () => {
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
    fireEvent.change(screen.getByTestId("input-prompt"), { target: { value: "Uganda event" } });
    await waitFor(() => expect(screen.getByTestId("button-send")).toBeEnabled());
    fireEvent.click(screen.getByTestId("button-send"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/42/messages", expect.objectContaining({
        body: JSON.stringify({ content: "Uganda event" }),
      }),
    ));
    const citation = await screen.findByRole("link", { name: "1. Official event" });
    expect(citation).toHaveAttribute("href", "https://example.org/event");
    expect(screen.getByText("Here is the event [1].")).toBeVisible();
    expect(screen.getAllByTestId("chat-search-activity")).toHaveLength(1);
  });

  it("collapses generated HTML in an assistant reply and previews it safely", async () => {
    const html = '<!DOCTYPE html><html><body><h1>Event guide</h1></body></html>';
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/conversations") return Response.json({ id: 49 });
      if (url === "/api/conversations/49/messages") return new Response(`data: ${JSON.stringify({ content: `Here is the page.\n\n\`\`\`html\n${html}\n\`\`\`` })}\n\n`);
      if (url === "/api/conversations/49") return Response.json({ messages: [
        { id: 1, role: "assistant", content: `Here is the page.\n\n\`\`\`html\n${html}\n\`\`\`` },
      ] });
      throw new Error(`Unexpected request ${url}`);
    }));
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    render(<AgentPage />);
    fireEvent.change(screen.getByTestId("input-prompt"), { target: { value: "Build an event page" } });
    fireEvent.click(screen.getByTestId("button-send"));
    await waitFor(() => expect(screen.queryByTestId("button-stop")).not.toBeInTheDocument());
    const reply = await screen.findByTestId("message-assistant-db-1");
    const control = within(reply).getByRole("button", { name: "View Code" });
    expect(control).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Here is the page.")).toBeVisible();
    expect(screen.queryByTitle("Generated website preview")).not.toBeInTheDocument();
    fireEvent.click(within(reply).getByRole("button", { name: "Publish" }));
    expect(screen.getByTestId("publish-dialog")).toHaveTextContent(html);
    expect(screen.queryByTitle("Generated website preview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close publish" }));
    fireEvent.click(within(reply).getByRole("button", { name: "Preview" }));
    expect(screen.getByTitle("Generated website preview")).toHaveAttribute("srcdoc", html);
    expect(screen.getByTitle("Generated website preview")).toHaveAttribute("sandbox", "allow-scripts");
  });
  it("drains queued prompts in order using their captured modes without search flags", async () => {
    let finishFirst!: () => void;
    const bodies: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/conversations") return Response.json({ id: 48 });
      if (url === "/api/conversations/48/messages") {
        bodies.push(JSON.parse(init!.body as string));
        if (bodies.length === 1) {
          return new Response(new ReadableStream({
            start(controller) {
              finishFirst = () => {
                controller.enqueue(new TextEncoder().encode('data: {"content":"Ready."}\n\n'));
                controller.close();
              };
            },
          }));
        }
        return new Response('data: {"content":"Ready."}\n\n');
      }
      if (url === "/api/conversations/48") return Response.json({ messages: [
        { id: 1, role: "assistant", content: "Ready." },
      ] });
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    render(<AgentPage />);
    const input = screen.getByTestId("input-prompt");
    fireEvent.change(input, { target: { value: "First prompt" } });
    fireEvent.click(screen.getByTestId("button-send"));
    await waitFor(() => expect(bodies).toHaveLength(1));
    fireEvent.click(screen.getByTestId("checkbox-plan-mode"));
    fireEvent.change(input, { target: { value: "Plan prompt" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByTestId("checkbox-plan-mode"));
    fireEvent.change(input, { target: { value: "Chat prompt" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByTestId("button-project-agent"));
    await act(async () => finishFirst());
    await waitFor(() => expect(bodies).toEqual([
      { content: "First prompt" },
      { content: "[PLAN MODE] Plan prompt" },
      { content: "Chat prompt" },
    ]));
    await waitFor(() => expect(screen.queryByTestId("button-toggle-queue")).not.toBeInTheDocument());
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