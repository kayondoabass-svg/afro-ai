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

const details = (over: Record<string, unknown> = {}) => ({
  app: { id: 7, title: "Kampala Market", subdomain: "kmarket", customDomain: null, appStatus: "active", suspendReason: null, suspendedAt: null, createdAt: "2025-01-02T12:00:00.000Z", updatedAt: "bad-date", ...over },
  owner: { id: "u1", email: "owner@example.test", firstName: "Amara", lastName: "O", plan: "pro" },
  projects: [{ id: 1, name: "Market", type: "web", status: "active" }],
  payments: [], ussd: [{ id: 3, plan: "starter", status: "active", created_at: null }],
  events: [{ id: 9, action: "suspended", reason: null, actor_id: "f1", created_at: null, email_status: "accepted", email_error: null, provider: "resend", provider_message_id: "m1" }],
  hosting: { freePeriodDays: 30, projectPreserved: true, dailyAllowance: "Existing daily free limits and midnight reset are unchanged." },
});
const ok = (body: unknown) => ({ json: async () => body });

function renderIt() {
  return render(<QueryClientProvider client={mocks.client}><FounderAppDetails appId={7} isFounder open onOpenChange={() => {}} /></QueryClientProvider>);
}

describe("FounderAppDetails", () => {
  afterEach(() => cleanup());
  beforeEach(() => { mocks.apiRequest.mockReset(); mocks.client?.clear(); });

  it("renders details with honest labels", async () => {
    mocks.apiRequest.mockResolvedValue(ok(details({ appStatus: "suspended" })));
    renderIt();
    await screen.findByText("Kampala Market");
    expect(mocks.apiRequest).toHaveBeenCalledWith("GET", "/api/admin/published-apps/7/details");
    expect(screen.getByTestId("text-suspend-reason")).toHaveTextContent("No reason was recorded");
    expect(screen.getByTestId("text-suspended-at")).toHaveTextContent("Not recorded");
    expect(screen.getByTestId("text-ussd-disclaimer")).toHaveTextContent("does not prove");
    expect(screen.getByTestId("text-event-email-9")).toHaveTextContent("delivery not confirmed");
    expect(screen.queryByText("m1")).toBeNull();
    expect(screen.getByTestId("button-confirm-reactivate")).toBeDisabled();
  });

  it("shows unavailable lookups instead of empty success", async () => {
    mocks.apiRequest.mockResolvedValue(ok({ ...details(), owner: null, payments: null, ussd: null, ussdApps: null, unavailableSections: ["payments", "ussd", "ussdApps"], relatedRecordsScope: "Owner-level records, not necessarily tied to this app.", historyNote: "Earlier events were not backfilled." }));
    renderIt();
    expect(await screen.findByTestId("unavailable-payments")).toBeInTheDocument();
    expect(screen.getByTestId("unavailable-ussd")).toBeInTheDocument();
    expect(screen.getByTestId("unavailable-ussdApps")).toBeInTheDocument();
    expect(screen.getByText("Owner record not found.")).toBeInTheDocument();
    expect(screen.getByTestId("text-related-scope")).toHaveTextContent("not necessarily");
    expect(screen.getByTestId("text-history-note")).toHaveTextContent("backfilled");
  });

  it("requires a reason and confirmation before suspending", async () => {
    mocks.apiRequest.mockResolvedValue(ok(details()));
    renderIt();
    const btn = await screen.findByTestId("button-confirm-suspend");
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByTestId("input-suspend-reason"), { target: { value: " abc " } });
    fireEvent.click(screen.getByTestId("checkbox-confirm-suspend"));
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByTestId("input-suspend-reason"), { target: { value: "  Phishing content  " } });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/admin/published-apps/7/suspend", { reason: "Phishing content" }));
  });
});
