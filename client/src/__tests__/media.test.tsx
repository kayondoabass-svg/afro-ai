import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MediaPage from "@/pages/media";
import { translations } from "@/lib/translations";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ t: (key: string, params?: Record<string, string | number>) =>
    (translations.en[key] || key).replace(/\{(\w+)\}/g, (_: string, name: string) => String(params?.[name] ?? `{${name}}`)) }),
}));

const job = {
  id: "job-1", kind: "video", status: "queued", prompt: "A city at sunrise", createdAt: "2026-01-01T00:00:00Z",
};

function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MediaPage /></QueryClientProvider>);
}

beforeEach(() => toast.mockClear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("media generation", () => {
  it("requires confirmation before posting a bounded video prompt and duration", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/media/jobs" && init?.method === "POST") return new Response(JSON.stringify(job), { status: 202 });
      return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await screen.findByText("No generations yet. Describe an image or video above to get started.");
    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    fireEvent.change(screen.getByLabelText("Video duration"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("media-prompt"), { target: { value: "A city at sunrise" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    expect(screen.getByText(/may incur charges/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm & generate" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));
    const body = JSON.parse((fetchMock.mock.calls.find(([, init]) => init?.method === "POST")![1] as RequestInit).body as string);
    expect(body).toEqual({ kind: "video", prompt: "A city at sunrise", duration: 5, idempotencyKey: expect.any(String) });
  });

  it("shows capability errors, rather than presenting made-up assets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Media generation is not configured" }), { status: 503 })));
    mount();
    expect(await screen.findByText(/Media generation is not configured/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("displays queued jobs with a cancel action and calls the authenticated endpoint", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/cancel")) return new Response(JSON.stringify({ ...job, status: "cancelled" }));
      if (url.endsWith("/job-1")) return new Response(JSON.stringify(job));
      return new Response(JSON.stringify({ jobs: [job] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    mount();
    expect(await screen.findByText("A city at sunrise")).toBeTruthy();
    expect(screen.getByText("Waiting to start…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel job" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/media/jobs/job-1/cancel", expect.objectContaining({ method: "POST", credentials: "include" })));
  });
});