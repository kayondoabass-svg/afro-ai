import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PublishDialog } from "./ai-chat";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/next-steps-card", () => ({ NextStepsCard: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("published live preview action", () => {
  it("offers the actual returned live URL only after an explicit publish succeeds", async () => {
    const html = "<!DOCTYPE html><html><body><h1>Event guide</h1></body></html>";
    const liveUrl = "https://events.example.org/guide";
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/published-apps") return Response.json([
        { subdomain: "event-guide", title: "Event guide", htmlContent: html },
      ]);
      if (url === "/api/publish") return new Response(
        `data: ${JSON.stringify({ type: "result", url: liveUrl, subdomain: "event-guide" })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PublishDialog code={html} open onOpenChange={() => {}} />
    </QueryClientProvider>);
    const publish = await screen.findByTestId("button-republish-confirm");
    expect(screen.queryByRole("link", { name: "Open live preview" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/publish")).toBe(false);
    fireEvent.click(publish);
    const link = await screen.findByRole("link", { name: "Open live preview" });
    expect(link).toHaveAttribute("href", liveUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(openWindow).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/publish", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ subdomain: "event-guide", htmlContent: html, title: "Event guide" }),
    })));
  });

  it("associates a publish with the active chat and exposes project-scoped follow-up actions", async () => {
    const html = "<!DOCTYPE html><html><body><h1>Studio</h1></body></html>";
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/published-apps") return Response.json([
        { id: 19, subdomain: "studio", title: "Studio", htmlContent: html },
      ]);
      if (url === "/api/published-apps/19/feedback") return Response.json({ items: [], openCount: 0 });
      if (url === "/api/publish") return new Response(
        `data: ${JSON.stringify({ type: "result", id: 19, projectId: 12, conversationId: 36, url: "https://studio.afroaigroup.com", subdomain: "studio" })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PublishDialog code={html} open onOpenChange={() => {}} conversationId={36} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByTestId("button-republish-confirm"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/publish", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ subdomain: "studio", htmlContent: html, title: "Studio", conversationId: 36 }),
    })));
    expect(await screen.findByTestId("button-open-edit-published")).toBeInTheDocument();
    expect(await screen.findByTestId("button-add-auth-published")).toBeInTheDocument();
  });
});