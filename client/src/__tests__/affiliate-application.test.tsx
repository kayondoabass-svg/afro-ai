import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AffiliatePage from "@/pages/affiliate";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toast.mockClear();
});

describe("affiliate application", () => {
  it("only shows pending review after successful submission, not an active link", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, status: "pending" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={new QueryClient()}><AffiliatePage /></QueryClientProvider>);
    expect(screen.getByText(/Approval required before referral tracking/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-affiliate-name"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByTestId("input-affiliate-email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByTestId("button-affiliate-submit"));
    await waitFor(() => expect(screen.getByText("Application received")).toBeTruthy());
    expect(screen.getByText(/pending review/)).toBeTruthy();
    expect(screen.queryByTestId("text-affiliate-link")).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).email).toBe("ada@example.com");
  });

  it("surfaces rate limit errors instead of treating the submission as approved", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "Too many affiliate applications. Please try again later." }),
      { status: 429 },
    )));
    render(<QueryClientProvider client={new QueryClient()}><AffiliatePage /></QueryClientProvider>);
    fireEvent.change(screen.getByTestId("input-affiliate-name"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByTestId("input-affiliate-email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByTestId("button-affiliate-submit"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Application not submitted",
      description: "Too many affiliate applications. Please try again later.",
    })));
    expect(screen.queryByText("Application received")).toBeNull();
  });
});