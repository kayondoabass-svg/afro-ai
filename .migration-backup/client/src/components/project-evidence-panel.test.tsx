import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectEvidencePanel } from "./project-evidence-panel";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ language: "sw", t: (key: string) => key }) }));

const item = {
  id: "evidence-1", name: "checkout.png", mimeType: "image/png", createdAt: "2025-02-01T10:00:00Z",
  capturedAt: "2025-02-01T10:00:00Z", pageLabel: "Checkout", phase: "before" as const,
  width: 1200, height: 800, fingerprint: "current-fingerprint", stale: false,
  review: { id: "review-1", createdAt: "2025-02-01T10:10:00Z", findings: ["Button contrast is low."], status: "reviewed" as const, source: "ai-visual" as const, fingerprint: "current-fingerprint" },
};
let evidence: any;
let fingerprint = "current-fingerprint";
let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;
const onRepair = vi.fn();

function mount() {
  render(<QueryClientProvider client={client}>
    <ProjectEvidencePanel conversationId={18} onRepair={onRepair} maxJobTokens={50000} onMaxJobTokensChange={vi.fn()} />
  </QueryClientProvider>);
}

it("sizes upload controls and history from their pane width rather than the desktop viewport", () => {
  mount();
  const layout = screen.getByTestId("evidence-responsive-layout");
  expect(layout).toHaveStyle({ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))" });
  expect(layout.className).not.toContain("xl:grid-cols");
  expect(screen.getByLabelText("Capture phase").parentElement?.parentElement).toHaveStyle({
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))",
  });
});

beforeEach(() => {
  evidence = { items: [item], events: [], job: null, budget: { maxTokens: 50000, maxRounds: 5, paygChargeCents: 2 }, limits: { fileBytes: 524288, maxItems: 8 } };
  fingerprint = "current-fingerprint";
  onRepair.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/workbench") && !init?.method) return Response.json({ fingerprint, repairs: 0 });
    if (url.endsWith("/workbench/evidence") && !init?.method) return Response.json(evidence);
    if (init?.method === "POST" && url.endsWith("/review")) {
      return Response.json({ id: "review-2", createdAt: "2025-02-02T10:00:00Z", findings: ["Visible heading."], status: "reviewed", source: "ai-visual", fingerprint });
    }
    if (init?.method === "POST" && url.endsWith("/repair")) return Response.json({ request: "Check the checkout contrast." });
    if (init?.method === "POST" && url.endsWith("/evidence")) return Response.json({ id: "evidence-2" });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

describe("ProjectEvidencePanel", () => {
  it("shows server-confirmed founder access instead of the customer token selector", async () => {
    evidence.budget.quotaExempt = true;
    mount();
    expect(await screen.findByTestId("founder-token-exemption")).toHaveTextContent("no customer token cap");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText(/Provider context and output limits/)).toBeInTheDocument();
  });
  it("keeps the token selector for customers", async () => {
    mount();
    await screen.findByAltText("Before capture — Checkout");
    expect(screen.getByRole("spinbutton")).toHaveValue(50000);
    expect(screen.queryByTestId("founder-token-exemption")).not.toBeInTheDocument();
  });
  it("renders a private Before gallery image with an explicit phase label", async () => {
    mount();
    const image = await screen.findByAltText("Before capture — Checkout");
    expect(image).toHaveAttribute("src", "/api/conversations/18/workbench/evidence/evidence-1/image");
    expect(screen.getAllByText("Before").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Private to this project")).toBeInTheDocument();
    expect(screen.getByText("Visual observations are not a test pass.")).toBeInTheDocument();
  });

  it("requires privacy confirmation and uploads raw base64 with the current version fingerprint", async () => {
    evidence = { ...evidence, items: [] };
    mount();
    await screen.findByText("No captures in this chat yet");
    const image = new File(["hello"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose visual evidence image"), { target: { files: [image] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Confirm that this image is safe to share");
    fireEvent.click(screen.getByLabelText(/I have permission to share this image/));
    fireEvent.change(screen.getByLabelText("Capture phase"), { target: { value: "after" } });
    fireEvent.change(screen.getByLabelText("Page or view label"), { target: { value: "Checkout" } });
    fireEvent.change(screen.getByLabelText("Choose visual evidence image"), { target: { files: [image] } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/18/workbench/evidence",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.stringContaining('"base64":"aGVsbG8="'),
      }),
    ));
    const request = JSON.parse(String(fetchMock.mock.calls.find(call => String(call[0]).endsWith("/workbench/evidence") && call[1]?.method === "POST")?.[1]?.body));
    expect(request).toMatchObject({ mimeType: "image/png", fingerprint: "current-fingerprint", phase: "after", pageLabel: "Checkout" });
    expect(request.base64).not.toContain("data:image");
  });

  it("requires deliberate review and repair approvals and forwards a reviewed repair request to chat", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Review ·/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm paid review" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/18/workbench/evidence/evidence-1/review",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ confirm: true, language: "sw" }) }),
    ));
    fireEvent.click(await screen.findByRole("button", { name: /Request repair ·/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Add request to chat" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/18/workbench/evidence/evidence-1/repair",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ confirm: true }) }),
    ));
    await waitFor(() => expect(onRepair).toHaveBeenCalledWith("Check the checkout contrast."));
  });

  it("blocks stale reviews and repairs and reports upload failures without claiming success", async () => {
    fingerprint = "new-version";
    evidence = { ...evidence, items: [{ ...item, stale: true }] };
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/workbench") && !init?.method) return Response.json({ fingerprint, repairs: 0 });
      if (String(input).endsWith("/workbench/evidence") && !init?.method) return Response.json(evidence);
      if (String(input).endsWith("/evidence") && init?.method === "POST") return new Response(JSON.stringify({ message: "Upload rejected" }), { status: 413 });
      return Response.json({});
    });
    mount();
    await screen.findByText("Source changed");
    expect(screen.getByRole("button", { name: /Review ·/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Request repair ·/ })).toBeDisabled();
    expect(screen.getByText(/recapture locally and upload a fresh image/i)).toBeInTheDocument();
  });

  it("surfaces failed uploads without adding fabricated evidence", async () => {
    evidence = { ...evidence, items: [] };
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/workbench") && !init?.method) return Response.json({ fingerprint, repairs: 0 });
      if (String(input).endsWith("/workbench/evidence") && !init?.method) return Response.json(evidence);
      if (String(input).endsWith("/workbench/evidence") && init?.method === "POST") return new Response(JSON.stringify({ message: "Image storage is unavailable." }), { status: 503 });
      return Response.json({});
    });
    mount();
    await screen.findByText("No captures in this chat yet");
    fireEvent.click(screen.getByLabelText(/I have permission to share this image/));
    fireEvent.change(screen.getByLabelText("Choose visual evidence image"), { target: { files: [new File(["image"], "fresh.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Image storage is unavailable.");
    expect(screen.getByText("No captures in this chat yet")).toBeInTheDocument();
  });

  it("shows persisted generations in chronological order with held, settled, released, and uncertain charge states", async () => {
    evidence = {
      ...evidence,
      items: [],
      jobs: [
        { id: "run-uncertain-456", status: "uncertain", reservedCents: 2, usedTokens: 341, estimated: true, calls: 3, completed: 1, createdAt: "2025-02-04T00:00:00Z", maxTokens: 30000 },
        { id: "run-held-123", status: "dispatched", reservedCents: 2, usedTokens: 186, estimated: false, calls: 2, completed: 2, createdAt: "2025-02-01T00:00:00Z", maxTokens: 50000 },
        { id: "run-settled-234", status: "settled", reservedCents: 2, usedTokens: 510, estimated: false, calls: 4, completed: 4, createdAt: "2025-02-02T00:00:00Z", maxTokens: 40000 },
        { id: "run-released-345", status: "released", reservedCents: 2, usedTokens: 0, estimated: true, calls: 0, completed: 0, createdAt: "2025-02-03T00:00:00Z", maxTokens: 10000 },
      ],
    };
    mount();
    const history = await screen.findByRole("region", { name: "Persisted generation and billing history" });
    expect(history).toHaveTextContent("Reservation held");
    expect(history).toHaveTextContent("not yet a settled customer charge");
    expect(history).toHaveTextContent("Customer charge settled");
    expect(history).toHaveTextContent("Reservation released");
    expect(history).toHaveTextContent("no customer charge");
    expect(history).toHaveTextContent("Charge outcome uncertain");
    expect(history).toHaveTextContent("needs reconciliation. Do not retry");
    expect(history).toHaveTextContent("Estimated provider usage");
    expect(history).toHaveTextContent("separate from customer charge");
    const rows = Array.from(history.querySelectorAll("li"));
    const historyText = rows.map(row => row.textContent || "").join("|");
    const ids = ["Run run-held", "Run run-sett", "Run run-rele", "Run run-unc"];
    const positions = ids.map(id => historyText.indexOf(id));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(history).not.toHaveTextContent(/provider name|model name/i);
  });

  it("groups persisted tool starts and completions chronologically and marks incomplete or failed calls distinctly", async () => {
    evidence = {
      ...evidence,
      items: [],
      events: [
        { id: "event-done", jobId: "run-1", createdAt: "2025-02-01T00:00:02Z", tool: "read_file", callId: "call:alpha123", status: "completed", paths: ["src/home.ts"] },
        { id: "event-stopped", jobId: "run-1", createdAt: "2025-02-01T00:00:04Z", tool: "write_file", callId: "unsafe id 2", status: "started", message: "Waiting for approval." },
        { id: "event-start", jobId: "run-1", createdAt: "2025-02-01T00:00:01Z", tool: "read_file", callId: "call:alpha123", status: "started" },
        { id: "event-failed", jobId: "run-1", createdAt: "2025-02-01T00:00:06Z", tool: "inspect_page", callId: "failed-777", status: "failed", message: "Permission denied." },
      ],
    };
    mount();
    const history = await screen.findByRole("list", { name: "Chronological tool calls" });
    expect(history).toHaveTextContent("Completed");
    expect(history).toHaveTextContent("Interrupted");
    expect(history).toHaveTextContent("Failed");
    expect(history).toHaveTextContent("Call callalph");
    expect(history).toHaveTextContent("Call unsafeid");
    const summaries = Array.from(history.querySelectorAll("summary"));
    expect(summaries.map(summary => summary.textContent)).toEqual([
      expect.stringContaining("read file"),
      expect.stringContaining("write file"),
      expect.stringContaining("inspect page"),
    ]);
    fireEvent.click(summaries[0]);
    expect(await screen.findByText("src/home.ts")).toBeInTheDocument();
    expect(history).toHaveTextContent("started");
    expect(history).toHaveTextContent("completed");
  });
});
