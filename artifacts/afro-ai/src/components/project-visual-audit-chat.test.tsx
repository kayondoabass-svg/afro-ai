import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderAudit(fetcher: (url: string) => unknown, conversationId = 51, liveToolActivity: { tool: string; callId: string; status: string; persisted?: boolean; summary?: string; jobId?: string; createdAt?: string }[] = []) {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const result = await fetcher(url);
    if (result instanceof Error) return { ok: false, status: 503, json: async () => ({ error: result.message }) } as Response;
    return { ok: true, status: 200, json: async () => result } as Response;
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
      <ProjectVisualAuditChat conversationId={conversationId} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()} liveToolActivity={liveToolActivity} />
  </QueryClientProvider>);
}

function openVisualTools() {
  const button = screen.getByRole("button", { name: /Visual tools/ });
  if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
}

function openSavedActivity() {
  screen.queryAllByRole("button", { name: /project actions?/i })
    .forEach(button => {
      if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
    });
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
  expect(screen.getByText("The real assistant reply")).toBeInTheDocument();
  expect(screen.queryByText("Conversation", { selector: "span" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Visual tools/ })).toHaveAttribute("aria-expanded", "false");
});

it("shows blocked capability without starting a capture and closes its passive stream on unmount", async () => {
  const view = renderAudit(url => url.endsWith("/visual-audit")
    ? { capability: { enabled: false, reason: "Remote capture is not configured." }, runs: [] }
    : { items: [], events: [], fingerprint: "source-abc" });
  openVisualTools();
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
  openVisualTools();
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
  openVisualTools();
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
  openVisualTools();
  await screen.findByText(/No saved screenshot runs/);
  eventSourceInstance?.emit("activity", JSON.stringify({
    id: "event-1", createdAt: new Date().toISOString(), tool: "read_project_file",
    status: "completed", title: "read project file · completed", message: "index.html was inspected",
  }));
  await screen.findAllByRole("button", { name: /1 project action/ });
  expect(screen.getByRole("list", { name: "Project action icons" })).toBeInTheDocument();
  expect(screen.queryByText("Read project file")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 project action/ })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("index.html was inspected")).not.toBeInTheDocument();
  openSavedActivity();
  await waitFor(() => expect(screen.getByText("read project file · completed")).toBeInTheDocument());
  expect(screen.getByText("Read project file")).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("shows meaningful icons, labels, and explicit statuses for streamed project tools while details stay collapsed", async () => {
  renderAudit(url => url.endsWith("/visual-audit")
    ? { capability: { enabled: false }, runs: [] }
    : { items: [], events: [], fingerprint: "source-abc" });
  const createdAt = new Date().toISOString();
  const stream = eventSourceInstance;
  act(() => {
    stream?.emit("activity", JSON.stringify({
      id: "stream-read", jobId: "stream-job", callId: "read-call", createdAt, tool: "read_file", status: "started",
      title: "read_file · started", message: "Reading project source.",
    }));
    stream?.emit("activity", JSON.stringify({
      id: "stream-search", jobId: "stream-job", createdAt, tool: "search_context", status: "completed",
      title: "search_context · completed",
    }));
    stream?.emit("activity", JSON.stringify({
      id: "stream-edit", jobId: "stream-job", createdAt, tool: "propose_edits", status: "failed",
      title: "propose_edits · failed", message: "Operation rejected.",
    }));
  });

  const group = await screen.findByRole("button", { name: /3 project actions/ });
  expect(group).toHaveAttribute("aria-expanded", "false");
  const iconStrip = screen.getByRole("list", { name: "Project action icons" });
  expect(iconStrip.querySelector(".lucide-file-text")).toBeInTheDocument();
  expect(iconStrip.querySelector(".lucide-search")).toBeInTheDocument();
  expect(iconStrip.querySelector(".lucide-pencil")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Project actions" })).not.toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Read project file: In progress" })).toBeInTheDocument();
  fireEvent.click(group);
  expect(screen.getByText("Read project file")).toBeInTheDocument();
  expect(screen.getByText("Search project context")).toBeInTheDocument();
  expect(screen.getByText("Propose file edits")).toBeInTheDocument();
  const visibleActions = screen.getByRole("list", { name: "Project actions" });
  expect(visibleActions.querySelector(".lucide-file-text")).toBeInTheDocument();
  expect(visibleActions.querySelector(".lucide-search")).toBeInTheDocument();
  expect(visibleActions.querySelector(".lucide-pencil")).toBeInTheDocument();
  expect(screen.getByText("In progress")).toBeInTheDocument();
  expect(screen.getByText("Completed")).toBeInTheDocument();
  expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
  expect(screen.getByText("In progress").parentElement?.querySelector(".animate-spin")).toBeInTheDocument();
  act(() => {
    stream?.emit("activity", JSON.stringify({
      id: "stream-read-completed", jobId: "stream-job", callId: "read-call", sequence: "99",
      createdAt: new Date(Date.parse(createdAt) + 1000).toISOString(), tool: "read_file",
      status: "completed", title: "read_file · completed",
    }));
  });
  expect(screen.queryByText("In progress")).not.toBeInTheDocument();
  expect(screen.getAllByText("Read project file")).toHaveLength(1);
  expect(screen.getByText("Reading project source.")).toBeInTheDocument();

  expect(await screen.findByText("Reading project source.")).toBeInTheDocument();
});

it("keeps streamed website saves in one per-turn action strip before history polling catches up", async () => {
  const createdAt = new Date().toISOString();
  renderAudit(url => url.includes("/activity") ? { items: [], hasMore: false, nextBefore: null } : {
    capability: { enabled: false }, runs: [], items: [], fingerprint: "source-abc",
  }, 51, ["generate_website", "save_website_version", "save_project_files"].map(tool => ({
    tool, callId: `chat:turn:${tool}`, jobId: "chat:turn", status: "succeeded", createdAt,
  })));
  expect(await screen.findByRole("button", { name: "3 project actions" })).toBeVisible();
  expect(screen.getAllByRole("list", { name: "Project action icons" })).toHaveLength(1);
});

it("keeps a long action count accurate while limiting only the collapsed icon row", async () => {
  renderAudit(url => url.includes("/activity") ? { items: [], hasMore: false, nextBefore: null } : {
    capability: { enabled: false }, runs: [], items: [], fingerprint: "source-abc",
  }, 51, Array.from({ length: 11 }, (_, index) => ({
    tool: "read_file", callId: `read-${index}`, jobId: "long-turn", status: "succeeded",
  })));
  const group = await screen.findByRole("button", { name: "11 project actions" });
  expect(group).toHaveTextContent("11 actions");
  expect(screen.getByRole("list", { name: "Project action icons" }).querySelectorAll('[role="listitem"]')).toHaveLength(5);
  expect(screen.getByLabelText("7 more actions; expand to see all")).toBeVisible();
  fireEvent.click(group);
  expect(screen.getByRole("list", { name: "Project actions" }).querySelectorAll(":scope > li")).toHaveLength(11);
});

it("surfaces unavailable history rather than replacing it with fabricated state", async () => {
  renderAudit(url => url.endsWith("/visual-audit") ? new Error("History unavailable.") : { items: [], fingerprint: "source-abc" });
  openVisualTools();
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
  openVisualTools();
  await screen.findByText(/No saved screenshot runs/);
  await screen.findAllByRole("button", { name: /project action/ });
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
  openVisualTools();
  await screen.findByText(/No saved screenshot runs/);
  await screen.findByRole("button", { name: /project action/ });
  openSavedActivity();
  await screen.findByText("Newest event");
  fireEvent.click(screen.getByRole("button", { name: "Load older activity" }));
  await screen.findAllByRole("button", { name: /project action/ });
  openSavedActivity();
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
  openVisualTools();
  await screen.findByText(/No saved screenshot runs/);
  openSavedActivity();
  expect(await screen.findByText(/History is temporarily offline/)).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry activity" }));
  await screen.findByRole("button", { name: /project action/ });
  openSavedActivity();
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
  openVisualTools();
  await screen.findByText(/No saved screenshot runs/);
  resolvePage?.(new Response(JSON.stringify(activityPage([savedEvent("stale", "7", "Stale conversation activity")], null, false)),
    { status: 200, headers: { "Content-Type": "application/json" } }));
  await screen.findByRole("button", { name: /project action/ });
  openSavedActivity();
  expect(await screen.findByText("New conversation activity")).toBeInTheDocument();
  expect(screen.queryByText("Stale conversation activity")).not.toBeInTheDocument();
  expect(oldSource?.closed).toBe(true);
});

it("keeps saved screenshot thumbnails visible outside collapsed visual tools and action groups", async () => {
  const runId = "saved-run";
  const createdAt = new Date().toISOString();
  const onOpenPreview = vi.fn();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const payload = url.endsWith("/visual-audit")
      ? { capability: { enabled: false }, runs: [{
        id: runId, fingerprint: "source-abc", phase: "after", status: "captured",
        createdAt, updatedAt: createdAt, evidenceIds: ["desktop-image", "mobile-image"],
      }] }
      : url.endsWith("/evidence")
        ? { fingerprint: "source-abc", items: [
          { id: "desktop-image", name: "Desktop image", phase: "after", profile: "desktop", fingerprint: "source-abc", createdAt },
          { id: "mobile-image", name: "Mobile image", phase: "after", profile: "mobile", fingerprint: "source-abc", createdAt },
        ] }
        : url.includes("/workbench/activity")
          ? activityPage([
            { id: "image-event", jobId: "job-image", createdAt, tool: "capture_screenshots", status: "completed", title: "Saved screenshots", evidenceIds: ["desktop-image", "mobile-image"] },
            { id: "action-event", jobId: "job-other", createdAt, tool: "read_project_file", status: "completed", title: "Reviewed source" },
          ], null, false)
          : { fingerprint: "source-abc", items: [] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <ProjectVisualAuditChat conversationId={51} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()} onOpenPreview={onOpenPreview} />
  </QueryClientProvider>);
  expect(await screen.findByRole("img", { name: "After desktop saved screenshot" })).toHaveAttribute(
    "src", "/api/conversations/51/workbench/evidence/desktop-image/image",
  );
  expect(screen.getByRole("img", { name: "After mobile saved screenshot" })).toBeInTheDocument();
  expect(screen.getAllByRole("img", { name: /saved screenshot/ })).toHaveLength(2);
  expect(screen.getByRole("button", { name: /Visual tools/ })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getAllByRole("button", { name: /project action/ }).every(button => button.getAttribute("aria-expanded") === "false")).toBe(true);
  fireEvent.click(screen.getByRole("link", { name: "Open after desktop screenshot" }));
  expect(onOpenPreview).toHaveBeenCalledWith({ kind: "evidence", id: "desktop-image", label: "After desktop screenshot" });
});

it("counts started and finished persisted ordinary-website operations once and names them when expanded", async () => {
  const createdAt = new Date().toISOString();
  renderAudit(url => url.endsWith("/visual-audit")
    ? { capability: { enabled: false }, runs: [] }
    : url.endsWith("/evidence") ? { items: [], fingerprint: "source-abc" }
      : url.includes("/workbench/activity") ? activityPage([
        { id: "gen-start", jobId: "ordinary-job", callId: "generate-call", createdAt, tool: "generate_website", status: "started", title: "Generating website" },
        { id: "gen-done", jobId: "ordinary-job", callId: "generate-call", createdAt: new Date(Date.parse(createdAt) + 10).toISOString(), tool: "generate_website", status: "succeeded", title: "Generated website" },
        { id: "version-start", jobId: "ordinary-job", callId: "version-call", createdAt, tool: "save_website_version", status: "started", title: "Saving website version" },
        { id: "version-done", jobId: "ordinary-job", callId: "version-call", createdAt: new Date(Date.parse(createdAt) + 20).toISOString(), tool: "save_website_version", status: "succeeded", title: "Website version saved" },
        { id: "save-failed", jobId: "ordinary-job", callId: "save-call", createdAt, tool: "save_project_files", status: "failed", title: "File save failed" },
      ], null, false) : { items: [] });
  const group = await screen.findByRole("button", { name: /3 project actions/ });
  const icons = screen.getByRole("list", { name: "Project action icons" });
  expect(icons.querySelectorAll(".lucide-code")).toHaveLength(2);
  expect(icons.querySelector(".lucide-file-text")).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Generate website: Completed" })).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Save project files: Failed" })).toBeInTheDocument();
  fireEvent.click(group);
  expect(screen.getByText("Generate website")).toBeInTheDocument();
  expect(screen.getByText("Save website version")).toBeInTheDocument();
  expect(screen.getByText("Save project files")).toBeInTheDocument();
  expect(screen.getByText("Generating website")).toBeInTheDocument();
  expect(screen.getByText("Generated website")).toBeInTheDocument();
  expect(screen.getByText("Website version saved")).toBeInTheDocument();
});

it("deduplicates transient activity by callId and visibly reports when the activity ledger could not be saved", async () => {
  const createdAt = new Date().toISOString();
  renderAudit(url => url.endsWith("/visual-audit")
    ? { capability: { enabled: false }, runs: [] }
    : url.endsWith("/evidence") ? { items: [], fingerprint: "source-abc" }
      : url.includes("/workbench/activity") ? activityPage([
        { id: "persisted-start", jobId: "chat:one", callId: "chat:one:generate_website", createdAt, tool: "generate_website", status: "started", title: "Generating website" },
      ], null, false) : { items: [] }, 51, [
    { tool: "generate_website", callId: "chat:one:generate_website", status: "failed", persisted: false, summary: "Activity history could not be saved for this turn." },
  ]);
  await screen.findByRole("listitem", { name: "Generate website: Failed" });
  const group = screen.getByRole("button", { name: /1 project action/ });
  expect(screen.getByRole("list", { name: "Project action icons" }).querySelectorAll(".lucide-code")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Activity history could not be saved for this turn.");
  fireEvent.click(group);
  expect(screen.getByText("Generate website")).toBeInTheDocument();
  expect(screen.getAllByText(/Activity history could not be saved/)).toHaveLength(1);
});

it("places proposal cards at their saved time between conversation messages", async () => {
  const onOpenPreview = vi.fn();
  const now = new Date().toISOString();
  const at = Date.parse(now);
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
      onOpenPreview={onOpenPreview} messageItems={[
        { id: "msg-before", timestamp: at - 1000, node: <p>Message before saved proposal</p> },
        { id: "msg-after", timestamp: at + 1000, node: <p>Message after saved proposal</p> },
      ]} />
  </QueryClientProvider>);
  await screen.findByRole("button", { name: /project action/ });
  openSavedActivity();
  expect(await screen.findByText("Message before saved proposal")).toBeInTheDocument();
  expect(screen.getByText("Message after saved proposal")).toBeInTheDocument();
  expect(await screen.findByText("Inspected project source")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Header direction image" })).toHaveAttribute("src", "/api/conversations/51/workbench/proposals/artifact-uuid/image");
  expect(screen.getByText("Illustrative proposal · not implemented or verified")).toBeInTheDocument();
  const feed = screen.getByRole("list", { name: "Chronological conversation and project activity" });
  const children = Array.from(feed.children);
  const beforeIndex = children.findIndex(child => child.textContent?.includes("Message before saved proposal"));
  const proposalIndex = children.findIndex(child => child.textContent?.includes("Illustrative proposal"));
  const afterIndex = children.findIndex(child => child.textContent?.includes("Message after saved proposal"));
  expect(beforeIndex).toBeLessThan(proposalIndex);
  expect(proposalIndex).toBeLessThan(afterIndex);
  fireEvent.click(screen.getByRole("button", { name: /^Open/ }));
  expect(onOpenPreview).toHaveBeenCalledWith({ kind: "proposal", id: "artifact-uuid", label: "Header direction" });
});

it("keeps evidence activity details expandable and signals collapsed failed groups", async () => {
  const createdAt = new Date().toISOString();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const payload = url.endsWith("/visual-audit")
      ? { capability: { enabled: false }, runs: [] }
      : url.endsWith("/evidence")
        ? { fingerprint: "source-abc", items: [{ id: "failed-evidence", name: "Before capture", phase: "before", profile: "desktop", fingerprint: "source-abc", createdAt }] }
        : url.includes("/workbench/activity")
          ? activityPage([
            { id: "failure-1", jobId: "job-failed", createdAt, tool: "capture_screenshots", status: "failed", title: "Capture failed with saved evidence", paths: ["src/page.tsx"], evidenceIds: ["failed-evidence"], message: "Remote browser timed out." },
            { id: "failure-2", jobId: "job-failed", createdAt, tool: "review_screenshots", status: "uncertain", title: "Review outcome uncertain", message: "Check the saved run before retrying." },
          ], null, false)
          : { items: [], fingerprint: "source-abc" };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <ProjectVisualAuditChat conversationId={51} onRepair={vi.fn()} visualAuditConsent={false} onVisualAuditConsentChange={vi.fn()} />
  </QueryClientProvider>);
  expect(await screen.findByRole("img", { name: "Before capture" })).toHaveAttribute(
    "src", "/api/conversations/51/workbench/evidence/failed-evidence/image",
  );
  const group = await screen.findByRole("button", { name: /2 project actions/ });
  expect(group).toHaveTextContent("Uncertain");
  expect(group).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(group);
  expect(await screen.findByText("Capture failed with saved evidence")).toBeInTheDocument();
  expect(screen.getByText("Remote browser timed out.")).toBeInTheDocument();
  expect(screen.getByText("src/page.tsx")).toBeInTheDocument();
  expect(screen.getByText("Review outcome uncertain")).toBeInTheDocument();
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
  await screen.findByRole("button", { name: /Save design proposal/ });
  fireEvent.click(screen.getByRole("button", { name: /Save design proposal/ }));
  await screen.findByRole("combobox", { name: "Completed image generation" });
  expect(screen.getByRole("option", { name: /cobalt and cream/ })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Ignore/ })).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  fireEvent.change(screen.getByRole("combobox", { name: "Completed image generation" }), { target: { value: "image-job-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Save proposal" }));
  await screen.findByRole("button", { name: /^Open/ });
  const post = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ mediaJobId: "image-job-1", title: "A cobalt and cream landing page header" });
  expect(JSON.parse(String(post?.[1]?.body)).requestId).toMatch(/^[a-f0-9-]{36}$/i);
});
