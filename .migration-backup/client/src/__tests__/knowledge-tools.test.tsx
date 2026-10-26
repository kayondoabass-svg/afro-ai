import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { capabilities, docs } = vi.hoisted(() => ({
  capabilities: { afroAvailable: true, webSearchAvailable: true },
  docs: [{ id: 1, status: "ready", title: "Notes", chunkCount: 1, charCount: 12, sourceType: "text" }],
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === "/api/knowledge/capabilities"
      ? { data: capabilities, isError: false }
      : { data: docs, isLoading: false },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import KnowledgePage from "@/pages/knowledge";

describe("knowledge tool controls", () => {
  beforeEach(() => {
    capabilities.afroAvailable = true;
    capabilities.webSearchAvailable = true;
  });

  it("sends selected provider and tools and renders clickable web citations and tool errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: "Answer", sources: [], usedTools: ["calculate", "web_search"],
      webSources: [{ url: "https://example.org/info", title: "Information", snippet: "Details" }],
      toolResults: [{ tool: "calculate", ok: false, error: { code: "INVALID_INPUT", message: "Invalid expression" } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<KnowledgePage />);
    fireEvent.change(screen.getByTestId("select-knowledge-provider"), { target: { value: "afro-test" } });
    fireEvent.click(screen.getByTestId("toggle-search-knowledge"));
    fireEvent.click(screen.getByTestId("toggle-calculate"));
    fireEvent.click(screen.getByTestId("toggle-web-search"));
    fireEvent.change(screen.getByTestId("input-question"), { target: { value: "What is 2 + 2?" } });
    fireEvent.click(screen.getByTestId("button-ask"));

    await waitFor(() => expect(screen.getByText("Answer")).toBeTruthy());
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/knowledge\/ask$/);
    expect(JSON.parse(options.body)).toEqual({
      question: "What is 2 + 2?",
      provider: "afro-test",
      enabledTools: ["calculate", "web_search"],
    });
    const link = screen.getByRole("link", { name: /Information/ });
    expect(link.getAttribute("href")).toBe("https://example.org/info");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Invalid expression")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("hides restricted provider and disables unavailable web search", () => {
    capabilities.afroAvailable = false;
    capabilities.webSearchAvailable = false;
    render(<KnowledgePage />);
    expect(screen.queryByRole("option", { name: "knowledge.afroTestModel" })).toBeNull();
    expect(screen.getByTestId("toggle-web-search").getAttribute("data-disabled")).toBe("");
  });

  it("cancels an in-flight question without displaying a late response", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<KnowledgePage />);
    fireEvent.change(screen.getByTestId("input-question"), { target: { value: "Question" } });
    fireEvent.click(screen.getByTestId("button-ask"));
    expect(screen.getByRole("status").textContent).toContain("knowledge.searching");
    fireEvent.click(screen.getByTestId("button-cancel-ask"));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    resolve(new Response(JSON.stringify({ answer: "Late answer", sources: [] })));
    await waitFor(() => expect(screen.queryByText("Late answer")).toBeNull());
    vi.unstubAllGlobals();
  });
});