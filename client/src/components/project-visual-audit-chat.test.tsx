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
  emit(type: string, data = "", lastEventId = "") {
    this.handlers.get(type)?.forEach(callback => callback({ data, lastEventId } as MessageEvent));
  }
}

function renderAudit(fetcher: (url: string) => unknown, conversationId = 51) {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const result = await fetcher(url);
    if (result instanceof Error) return { ok: false, status: 503, json: async () => ({ error: result.message }) } as Response;
    return { ok: true, status: 200, json: async () => result } as Response;
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
     <ProjectVisualAuditChat conversationId={conversationId} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()} />
  </QueryClientProvider>);
}

function openSavedActivity() {
  const button = screen.getByRole("button", { name: /Saved activity/ });
  if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
}

beforeEach(() => { eventSourceInstance = undefined; });
afterEach(() => { vi.unstubAllGlobals(); });
it("keeps conversation replies visible when saved-activity information is collapsed", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ items: [], runs: [], capability: { enabled: false } }),
  })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectVisualAuditChat
    conversationId={51} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()}
    messageItems={[{ id: "reply", timestamp: Date.now(), node: <p>The real assistant reply</p> }]}
  /></QueryClientProvider>);
  await screen.findByText("The real assistant reply");
  fireEvent.click(screen.getByRole("button", { name: /Saved activity/ }));
  expect(screen.getByText("The real assistant reply")).toBeInTheDocument();
});

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
  openSavedActivity();
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

const activityPage = (items: Array<Record<string, unknown>>, nextBefore: string | null, hasMore: boolean) => ({
  items, nextBefore, hasMore, retention: "project-lifetime", legacyHistory: "Only surviving legacy activity can be imported.",
});
const savedEvent = (id: string, sequence: string, title: string) => ({
  id, sequence, createdAt: "2024-02-01T10:00:00.000Z", tool: "read_project_file", status: "completed", title,
});

it("restores saved history on initial load, merges live duplicates by stable event ID and orders unsafe integers exactly", async () => {
  renderAudit(url => {
    if (url.includes("/workbench/activity")) return activityPage([
      savedEvent("ev-2", "90071992547409930", "Saved newest"),
      savedEvent("ev-1", "90071992547409929", "Saved older"),
    ], "90071992547409929", false);
    return url.endsWith("/visual-audit")
      ? { capability: { enabled: false }, runs: [] }
      : { items: [], fingerprint: "source-abc" };
  });
  await screen.findByText(/No saved screenshot runs/);
  openSavedActivity();
  expect(await screen.findByText("Saved older")).toBeInTheDocument();
  expect(screen.getByText(/project’s lifetime/)).toBeInTheDocument();
  eventSourceInstance?.emit("activity", JSON.stringify(savedEvent("ev-2", "90071992547409930", "Updated live title")), "90071992547409930");
  await screen.findByText("Updated live title");
  expect(screen.queryByText("Saved newest")).not.toBeInTheDocument();
  const titles = screen.getAllByText(/Saved older|Updated live title/).map(element => element.textContent);
  expect(titles).toEqual(["Saved older", "Updated live title"]);
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("pages older history without losing newer events and deduplicates overlap", async () => {
  const olderRequest = savedEvent("ev-1", "1", "Old event");
  const newestRequest = savedEvent("ev-2", "2", "Newest event");
  renderAudit(url => {
    if (url.includes("/workbench/activity")) {
      return url.includes("before=")
        ? activityPage([olderRequest, newestRequest], null, false)
        : activityPage([newestRequest], "2", true);
    }
    return url.endsWith("/visual-audit")
      ? { capability: { enabled: false }, runs: [] }
      : { items: [], fingerprint: "source-abc" };
  });
  await screen.findByText(/No saved screenshot runs/);
  openSavedActivity();
  await screen.findByText("Newest event");
  fireEvent.click(screen.getByRole("button", { name: "Load older activity" }));
  await screen.findByText("Old event");
  expect(screen.getAllByText("Newest event")).toHaveLength(1);
  expect(vi.mocked(fetch).mock.calls.map(([request]) => String(request)).find(url => url.includes("before=")))
    .toContain("before=2");
});

it("shows a retry for initial history errors and keeps history fetch independent of EventSource", async () => {
  vi.stubGlobal("EventSource", undefined);
  let fail = true;
  renderAudit(url => {
    if (url.includes("/workbench/activity")) {
      if (fail) return new Error("History is temporarily offline.");
      return activityPage([savedEvent("ev-1", "1", "Restored after retry")], null, false);
    }
    return url.endsWith("/visual-audit")
      ? { capability: { enabled: false }, runs: [] }
      : { items: [], fingerprint: "source-abc" };
  });
  await screen.findByText(/No saved screenshot runs/);
  openSavedActivity();
  expect(await screen.findByText(/History is temporarily offline/)).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry activity" }));
  expect(await screen.findByText("Restored after retry")).toBeInTheDocument();
});

it("discards a late activity page after switching conversations and closes the old stream", async () => {
  let resolvePage: ((value: Response) => void) | undefined;
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/workbench/activity") && url.includes("/51/")) {
      return await new Promise<Response>(resolve => { resolvePage = resolve; });
    }
    const body = url.includes("/workbench/activity")
      ? activityPage([savedEvent("new-conversation", "8", "New conversation activity")], null, false)
      : url.endsWith("/visual-audit") ? { capability: { enabled: false }, runs: [] } : { items: [], fingerprint: "source-abc" };
    return { ok: true, status: 200, json: async () => body } as Response;
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>
    <ProjectVisualAuditChat conversationId={51} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()} />
  </QueryClientProvider>);
  const oldSource = eventSourceInstance;
  view.rerender(<QueryClientProvider client={client}>
    <ProjectVisualAuditChat conversationId={52} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()} />
  </QueryClientProvider>);
  await screen.findByText(/No saved screenshot runs/);
  resolvePage?.(new Response(JSON.stringify(activityPage([savedEvent("stale", "7", "Stale conversation activity")], null, false)),
    { status: 200, headers: { "Content-Type": "application/json" } }));
  openSavedActivity();
  expect(await screen.findByText("New conversation activity")).toBeInTheDocument();
  expect(screen.queryByText("Stale conversation activity")).not.toBeInTheDocument();
  expect(oldSource?.closed).toBe(true);
});

it("interleaves conversation replies with expandable saved actions and opens owned proposal art in preview", async () => {
  const onOpenPreview = vi.fn();
  const now = new Date().toISOString();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const payload = url.includes("/workbench/activity")
      ? activityPage([
        { id: "action-1", jobId: "job-1", sequence: "1", createdAt: now, tool: "read_project_file", status: "completed", title: "Inspected project source" },
        { id: "proposal-event", jobId: "job-2", sequence: "2", createdAt: now, tool: "design_proposal", status: "saved", title: "Header direction", artifactId: "artifact-uuid" },
      ], null, false)
      : url.endsWith("/visual-audit") ? { capability: { enabled: false }, runs: [] }
        : { items: [], fingerprint: "source-abc" };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <ProjectVisualAuditChat conversationId={51} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()}
      onOpenPreview={onOpenPreview} messageItems={[{ id: "msg-1", timestamp: Date.parse(now) - 1000, node: <p>Customer asked for a narrower header</p> }]} />
  </QueryClientProvider>);
  await screen.findByText(/No saved screenshot runs/);
  openSavedActivity();
  expect(await screen.findByText("Customer asked for a narrower header")).toBeInTheDocument();
  expect(await screen.findByText("Inspected project source")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Open in preview/ }));
  expect(onOpenPreview).toHaveBeenCalledWith({ kind: "proposal", id: "artifact-uuid", label: "Header direction" });
});

it("attaches an already-completed image only after an explicit save action", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/media/jobs") return new Response(JSON.stringify({ jobs: [
      { id: "image-job-1", kind: "image", status: "succeeded", prompt: "A cobalt and cream landing page header", createdAt: new Date().toISOString() },
      { id: "text-job", kind: "text", status: "succeeded", prompt: "Ignore", createdAt: new Date().toISOString() },
      { id: "pending-job", kind: "image", status: "running", prompt: "Ignore", createdAt: new Date().toISOString() },
    ] }), { status: 200 });
    if (init?.method === "POST") return new Response(JSON.stringify({ id: "proposal-id", title: "A cobalt and cream landing page header", createdAt: new Date().toISOString() }), { status: 201 });
    const payload = url.includes("/workbench/activity")
      ? activityPage([], null, false)
      : url.endsWith("/visual-audit") ? { capability: { enabled: false }, runs: [] }
        : { items: [], fingerprint: "source-abc" };
    return new Response(JSON.stringify(payload), { status: 200 });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <ProjectVisualAuditChat conversationId={51} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()} />
  </QueryClientProvider>);
  await screen.findByText(/No saved screenshot runs/);
  openSavedActivity();
  fireEvent.click(screen.getByRole("button", { name: /Save design proposal/ }));
  await screen.findByRole("combobox", { name: "Completed image generation" });
  expect(screen.getByRole("option", { name: /cobalt and cream/ })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Ignore/ })).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  fireEvent.change(screen.getByRole("combobox", { name: "Completed image generation" }), { target: { value: "image-job-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Save proposal" }));
  await screen.findByRole("button", { name: /Open in preview/ });
  const post = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ mediaJobId: "image-job-1", title: "A cobalt and cream landing page header" });
  expect(JSON.parse(String(post?.[1]?.body)).requestId).toMatch(/^[a-f0-9-]{36}$/i);
});
