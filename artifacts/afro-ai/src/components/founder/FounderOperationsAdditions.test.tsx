import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), client: null as any }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  mocks.client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { apiRequest: mocks.apiRequest, queryClient: mocks.client };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { FounderAppDetails } from "./FounderAppDetails";
import { FounderOperationsHealth } from "./FounderOperationsHealth";
import { founderAppStatus, HOSTING_EXPIRED_REASON } from "./founder-app-status";

const ok = (body: unknown) => ({ json: async () => body });
const details = (app: Record<string, unknown>) => ({
  app: { id: 7, title: "Kampala Market", subdomain: "kmarket", appStatus: "suspended", ...app },
  owner: null, projects: [], payments: [], ussd: [], events: [], ussdApps: [],
  source: { htmlBytes: 4096, snapshotCount: 3, linkedProjects: 1, message: "Metadata only." },
  hosting: { freePeriodDays: 30, projectPreserved: true },
});
const wrap = (ui: any) => render(<QueryClientProvider client={mocks.client}>{ui}</QueryClientProvider>);

describe("founder status labels", () => {
  it("maps each state to a distinct label", () => {
    expect(founderAppStatus({ appStatus: "suspended", suspendReason: HOSTING_EXPIRED_REASON }).label).toBe("Hosting expired");
    expect(founderAppStatus({ appStatus: "suspended", suspendReason: "unpublish-pending" }).label).toBe("Unpublish pending");
    expect(founderAppStatus({ appStatus: "suspended", suspendReason: "customer-unpublished" }).label).toBe("Unpublished");
    expect(founderAppStatus({ appStatus: "suspended", suspendReason: "deletion-pending" }).label).toBe("Deletion pending");
    expect(founderAppStatus({ appStatus: "suspended", suspendReason: "spam" }).label).toBe("Administrative suspension");
    expect(founderAppStatus({ appStatus: "active" }).label).toBe("Active");
  });
});

describe("FounderAppDetails additions", () => {
  afterEach(() => cleanup());
  beforeEach(() => { mocks.apiRequest.mockReset(); mocks.client?.clear(); });

  it("requires confirmation before retrying unpublish and invalidates details", async () => {
    mocks.apiRequest.mockImplementation(async (method: string) => method === "GET" ? ok(details({ suspendReason: "unpublish-pending" })) : ok({ id: 7, offline: true, sourcePreserved: true }));
    const spy = vi.spyOn(mocks.client, "invalidateQueries");
    wrap(<FounderAppDetails appId={7} isFounder open onOpenChange={() => {}} />);
    expect(await screen.findByTestId("status-app")).toHaveTextContent("Unpublish pending");
    expect(screen.getByTestId("text-action-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("button-confirm-reactivate")).toBeNull();
    expect(screen.getByTestId("text-source-snapshots")).toHaveTextContent("3");
    const btn = screen.getByTestId("button-retry-unpublish");
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByTestId("checkbox-confirm-retry-unpublish"));
    fireEvent.click(btn);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/admin/published-apps/7/retry-unpublish", { confirm: true }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["/api/admin/published-apps", "7", "details"] }));
  });

  it("invalidates details when retry fails", async () => {
    mocks.apiRequest.mockImplementation(async (method: string) => { if (method === "GET") return ok(details({ suspendReason: "unpublish-pending" })); throw new Error("409: not pending"); });
    const spy = vi.spyOn(mocks.client, "invalidateQueries");
    wrap(<FounderAppDetails appId={7} isFounder open onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByTestId("checkbox-confirm-retry-unpublish"));
    fireEvent.click(screen.getByTestId("button-retry-unpublish"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["/api/admin/published-apps", "7", "details"] }));
  });

  it("shows hosting expired without retry", async () => {
    mocks.apiRequest.mockResolvedValue(ok(details({ suspendReason: HOSTING_EXPIRED_REASON })));
    wrap(<FounderAppDetails appId={7} isFounder open onOpenChange={() => {}} />);
    expect(await screen.findByTestId("status-app")).toHaveTextContent("Hosting expired");
    expect(screen.queryByTestId("button-retry-unpublish")).toBeNull();
    expect(screen.getByTestId("text-hosting-explainer")).toHaveTextContent("separate");
  });
});

describe("FounderOperationsHealth", () => {
  afterEach(() => cleanup());
  beforeEach(() => { mocks.apiRequest.mockReset(); mocks.client?.clear(); });

  it("renders release, feature id and keeps backups unverified", async () => {
    mocks.apiRequest.mockResolvedValue(ok({ checkedAt: "2026-01-01T00:00:00Z", release: "abcdef1234567890", featureVersion: "founder-operations-2026-11", checks: { dns: { status: "ok", message: "Resolves" }, sourceStorage: { status: "unavailable", message: "Bucket unreachable" }, backups: { status: "unverified", message: "Not checked" } } }));
    wrap(<FounderOperationsHealth isFounder />);
    await waitFor(() => expect(screen.getByTestId("text-release-hash")).toHaveTextContent("abcdef1"));
    expect(screen.getByTestId("text-feature-version")).toHaveTextContent("founder-operations-2026-11");
    expect(screen.getByTestId("status-check-source")).toHaveTextContent("Unavailable");
    expect(screen.getByTestId("status-check-backups")).toHaveTextContent("Unverified");
  });

  it("does not imply health when endpoint fails", async () => {
    mocks.apiRequest.mockRejectedValue(new Error("404"));
    wrap(<FounderOperationsHealth isFounder />);
    expect(await screen.findByTestId("status-operations-health-error")).toBeInTheDocument();
    expect(screen.queryByText("Responding")).toBeNull();
  });
});
