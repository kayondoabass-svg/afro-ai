import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import KeyoStudioAdmin from "@/pages/keyo-studio-admin";

const state = vi.hoisted(() => ({ userId: "founder-user", founder: true, denied: false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: state.userId } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/queryClient")>(), apiRequest: vi.fn(),
}));
const request = vi.mocked(apiRequest);
function downloadAnalytics(overrides: Record<string, unknown> = {}) {
  return {
    platform: { status: "available", total: 0, trackingSince: "2026-01-10T00:00:00Z", byArtifact: [], recordingHealthy: true, note: "", ...(overrides.platform as object ?? {}) },
    github: { status: "available", total: 0, desktop: 0, source: 0, bundles: 0, byRelease: [], checkedAt: "2026-10-12T12:00:00Z", note: "", ...(overrides.github as object ?? {}) },
    huggingFace: { status: "available", total: 0, checkedAt: "2026-10-12T12:00:00Z", note: "", ...(overrides.huggingFace as object ?? {}) },
    outboundClicks: { github: 0, huggingFace: 0, ...(overrides.outboundClicks as object ?? {}) },
    note: "",
  };
}
beforeEach(() => {
  queryClient.clear();
  state.userId = "founder-user"; state.founder = true; state.denied = false;
  request.mockImplementation(async (method, path) => {
    if (state.denied) throw new Error("403: Private dashboard");
    const payload = path === "/api/keyo-studio/admin/downloads" ? downloadAnalytics() : {
      isFounder: state.founder, authorizedUsersCount: 2, activeViewersCount: 1, presenceWindowSeconds: 90,
      invites: state.founder ? [{ email: "viewer@example.test", createdAt: "2026-10-11T00:00:00Z" }] : [],
      release: { version: "test-alpha", stage: "developer-alpha", downloadUrl: "/downloads/keyo-studio/test.tgz" },
      publicLinks: { github: "https://github.com/example/keyo", huggingFace: "https://huggingface.co/spaces/example/keyo" },
    };
    return {
      json: async () => payload,
      ok: true, status: method === "GET" ? 200 : 204,
    } as Response;
  });
});
afterEach(() => { cleanup(); queryClient.clear(); request.mockReset(); });
function view() { return render(<QueryClientProvider client={queryClient}><KeyoStudioAdmin /></QueryClientProvider>); }

describe("KEYO private dashboard UI", () => {
  it("renders actual release data and founder email grant controls", async () => {
    view();
    expect(await screen.findByText("vtest-alpha")).toBeInTheDocument();
    expect(screen.getByText("viewer@example.test")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Email address to invite" });
    fireEvent.change(input, { target: { value: "new@example.test" } });
    const button = screen.getByRole("button", { name: /grant|add|invite/i });
    fireEvent.click(button);
    await waitFor(() => expect(request).toHaveBeenCalledWith("POST", "/api/keyo-studio/admin/invites", { email: "new@example.test" }));
  });
  it("shows no invite management to a viewer", async () => {
    state.founder = false; state.userId = "viewer-user";
    view();
    expect(await screen.findByText("vtest-alpha")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email address to invite" })).not.toBeInTheDocument();
    expect(screen.queryByText("viewer@example.test")).not.toBeInTheDocument();
  });
  it("does not reveal release or invitation data after access is denied", async () => {
    state.denied = true;
    view();
    expect(await screen.findByText("Private access only")).toBeInTheDocument();
    expect(screen.queryByText("vtest-alpha")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email address to invite" })).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith("GET", "/api/keyo-studio/admin/downloads");
  });
  it("shows real numeric zeros distinctly from unavailable counts", async () => {
    view();
    expect(await screen.findByText("Afro AI transfers")).toBeInTheDocument();
    expect(screen.getByText("Since Jan 10, 2026")).toBeInTheDocument();
    expect(screen.getByText("Asset downloads across reported releases")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(7);
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
    expect(screen.getAllByText("Tracked archive-link clicks")).toHaveLength(2);
    expect(screen.getByText(/not completed downloads and not direct Hugging Face traffic/)).toBeInTheDocument();
  });
  it("does not turn null or unavailable upstream counts into zero", async () => {
    request.mockImplementation(async (_method, path) => ({
      json: async () => path === "/api/keyo-studio/admin/downloads" ? downloadAnalytics({
        platform: { status: "unavailable", total: null, note: "Transfer log unavailable." },
        github: { status: "unavailable", total: null, desktop: null, source: null, bundles: null, note: "GitHub check failed." },
        huggingFace: { status: "unavailable", total: null, note: "Space data unavailable." },
        outboundClicks: { github: null, huggingFace: null },
      }) : {
        isFounder: true, authorizedUsersCount: 2, activeViewersCount: 1, presenceWindowSeconds: 90, invites: [],
        release: { version: "test-alpha", downloadUrl: "/downloads/test.tgz" }, publicLinks: {},
      },
      ok: true, status: 200,
    } as Response));
    view();
    expect(await screen.findAllByText("Unavailable")).toHaveLength(5);
    expect(screen.queryByText("Asset downloads across reported releases")).not.toBeInTheDocument();
  });
  it("labels an unpublished Hugging Face Space as not published, never zero", async () => {
    request.mockImplementation(async (_method, path) => ({
      json: async () => path === "/api/keyo-studio/admin/downloads" ? downloadAnalytics({
        huggingFace: { status: "not_published", total: null, note: "No public Space is published." },
      }) : {
        isFounder: true, authorizedUsersCount: 2, activeViewersCount: 1, presenceWindowSeconds: 90, invites: [],
        release: { version: "test-alpha" }, publicLinks: {},
      },
      ok: true, status: 200,
    } as Response));
    view();
    expect(await screen.findByText("Not published / Unavailable")).toBeInTheDocument();
    expect(screen.getByText("No public Space is published.")).toBeInTheDocument();
    expect(screen.queryByText("Public Space download count")).not.toBeInTheDocument();
  });
  it("warns when full-file transfer recording is unhealthy", async () => {
    request.mockImplementation(async (_method, path) => ({
      json: async () => path === "/api/keyo-studio/admin/downloads" ? downloadAnalytics({
        platform: { recordingHealthy: false, note: "Some transfer events were not recorded." },
      }) : {
        isFounder: true, authorizedUsersCount: 2, activeViewersCount: 1, presenceWindowSeconds: 90, invites: [],
        release: { version: "test-alpha" }, publicLinks: {},
      },
      ok: true, status: 200,
    } as Response));
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent("Transfer recording health needs attention");
    expect(screen.getByRole("alert")).toHaveTextContent("Some transfer events were not recorded.");
  });
  it("keeps endpoint failures local and offers a working retry", async () => {
    let fail = true;
    request.mockImplementation(async (_method, path) => {
      if (path === "/api/keyo-studio/admin/downloads" && fail) throw new Error("503: Analytics unavailable");
      return {
        json: async () => path === "/api/keyo-studio/admin/downloads" ? downloadAnalytics() : {
          isFounder: true, authorizedUsersCount: 2, activeViewersCount: 1, presenceWindowSeconds: 90, invites: [],
          release: { version: "test-alpha" }, publicLinks: {},
        },
        ok: true, status: 200,
      } as Response;
    });
    view();
    expect(await screen.findByText("Download evidence could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("vtest-alpha")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry downloads" }));
    expect(await screen.findByText("Asset downloads across reported releases")).toBeInTheDocument();
  });
  it("fetches download analytics only after dashboard access is confirmed", async () => {
    state.denied = true;
    view();
    expect(await screen.findByText("Private access only")).toBeInTheDocument();
    await waitFor(() => expect(request).toHaveBeenCalledWith("GET", "/api/keyo-studio/admin"));
    expect(request).not.toHaveBeenCalledWith("GET", "/api/keyo-studio/admin/downloads");
  });
});
