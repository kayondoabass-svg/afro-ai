import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseInspectionViews, ProjectVisualAuditChat } from "./project-visual-audit-chat";

let eventSourceInstance: FakeEventSource | undefined;
class FakeEventSource {
  static CONNECTING = 0;
  static CLOSED = 2;
  readyState = FakeEventSource.CONNECTING;
  handlers = new Map<string, Array<(event: Event) => void>>();
  closed = false;
  constructor(_url: string) { eventSourceInstance = this; }
  addEventListener(type: string, callback: (event: Event) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), callback]);
  }
  close() { this.closed = true; this.readyState = FakeEventSource.CLOSED; }
  emit(type: string, data = "") {
    this.handlers.get(type)?.forEach(callback => callback({ data } as MessageEvent));
  }
}

function renderAudit(fetcher: (url: string) => unknown) {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const result = await fetcher(url);
    if (result instanceof Error) return { ok: false, status: 503, json: async () => ({ error: result.message }) } as Response;
    return { ok: true, status: 200, json: async () => result } as Response;
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <ProjectVisualAuditChat conversationId={51} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()} />
  </QueryClientProvider>);
}

beforeEach(() => { eventSourceInstance = undefined; });
afterEach(() => { vi.unstubAllGlobals(); });

it("shows blocked capability without starting a capture and closes its passive stream on unmount", async () => {
  const view = renderAudit(url => url.endsWith("/visual-audit")
    ? { capability: { enabled: false, reason: "Remote capture is not configured." }, runs: [] }
    : { items: [], events: [], fingerprint: "source-abc" });
  await screen.findByText(/Remote capture is not configured/);
  const capture = screen.getByRole("button", { name: /Capture Before/ });
  expect(capture).toBeDisabled();
  expect(vi.mocked(fetch).mock.calls.some(([request, options]) => options?.method === "POST")).toBe(false);
  view.unmount();
  expect(eventSourceInstance?.closed).toBe(true);
});

it("requires explicit image-sharing consent and sends a unique confirmed capture request", async () => {
  renderAudit(url => url.endsWith("/visual-audit")
    ? { capability: { enabled: true }, runs: [] }
    : { items: [], events: [], fingerprint: "source-abc" });
  await screen.findByRole("button", { name: /Capture Before/ });
  fireEvent.click(screen.getByRole("button", { name: /Capture Before/ }));
  const confirm = screen.getByRole("button", { name: "Capture paired screenshots" });
  expect(confirm).toBeDisabled();
  const checks = screen.getAllByRole("checkbox");
  fireEvent.click(checks[checks.length - 1]);
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
  const call = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST");
  const request = JSON.parse(String(call?.[1]?.body));
  expect(request).toMatchObject({ confirm: true, phase: "before", fingerprint: "source-abc" });
  expect(request.requestId).toMatch(/^[a-f0-9-]{36}$/i);
});

it("links an After capture to the latest prepared repair only when its saved source fingerprint changed", async () => {
  const parent = {
    id: "11111111-1111-4111-8111-111111111111", fingerprint: "old-source", phase: "after",
    status: "captured", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    evidenceIds: [], repairDepth: 1,
    repair: { request: "Adjust the narrow navigation.", preparedAt: new Date().toISOString(), status: "awaiting-reviewed-save" as const },
  };
  renderAudit(url => url.endsWith("/visual-audit")
    ? { capability: { enabled: true }, runs: [parent] }
    : { items: [], events: [], fingerprint: "new-source" });
  await screen.findByRole("button", { name: /Capture After/ });
  expect(screen.getByText(/will continue the latest prepared repair/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Capture After/ }));
  const checks = screen.getAllByRole("checkbox");
  fireEvent.click(checks[checks.length - 1]);
  fireEvent.click(screen.getByRole("button", { name: "Capture paired screenshots" }));
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
  const request = JSON.parse(String(vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST")?.[1]?.body));
  expect(request.parentRunId).toBe(parent.id);
  expect(screen.getByRole("link", { name: /Download private JSON report/ })).toHaveAttribute(
    "href", `/api/conversations/51/workbench/visual-audit/${parent.id}/report`,
  );
});

it("shows exactly six observations per view only for valid structured inspection", () => {
  const six = Array.from({ length: 6 }, (_, index) => ({ label: `Observation ${index + 1}`, result: "Needs review" }));
  expect(parseInspectionViews({ desktop: six, mobile: six })?.desktop).toHaveLength(6);
  expect(parseInspectionViews({ desktop: six, mobile: six.slice(1) })).toBeNull();
  expect(parseInspectionViews("not-json")).toBeNull();
  const structured = Array.from({ length: 6 }, (_, index) => ({ check: `check-${index}`, status: "issue", detail: "Button clips at mobile width" }));
  expect(parseInspectionViews({ desktop: structured, mobile: structured })?.mobile[0].detail).toContain("Button clips");
});

it("renders only safe saved activity received over the read-only stream", async () => {
  renderAudit(url => url.endsWith("/visual-audit")
    ? { capability: { enabled: false }, runs: [] }
    : { items: [], events: [], fingerprint: "source-abc" });
  await screen.findByText(/No saved screenshot runs/);
  fireEvent.click(screen.getByRole("button", { name: /Saved activity/ }));
  eventSourceInstance?.emit("activity", JSON.stringify({
    id: "event-1", createdAt: new Date().toISOString(), tool: "read_project_file",
    status: "completed", title: "read project file · completed", message: "index.html was inspected",
  }));
  await waitFor(() => expect(screen.getByText("read project file · completed")).toBeInTheDocument());
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("surfaces unavailable history rather than replacing it with fabricated state", async () => {
  renderAudit(url => url.endsWith("/visual-audit") ? new Error("History unavailable.") : { items: [], fingerprint: "source-abc" });
  await screen.findByText(/Capture capability could not be checked/);
  expect(screen.queryByText(/No saved screenshot runs/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry check" })).toBeInTheDocument();
});
