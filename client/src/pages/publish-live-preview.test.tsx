import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    render(<PublishDialog code={html} open onOpenChange={() => {}} />);
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
});