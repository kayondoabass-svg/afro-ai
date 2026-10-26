import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProgrammeDetail, Workspace } from "./programme-types";
import ProgrammeWorkspace from "./ProgrammeWorkspace";
import FounderProgrammes from "./FounderProgrammes";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queryClient")>("@/lib/queryClient");
  return { ...actual, apiRequest: mocks.apiRequest };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("wouter", async () => {
  const ReactModule = await import("react");
  return {
    Link: (props: { href: string; children: React.ReactNode; className?: string }) =>
      ReactModule.createElement("a", { href: props.href, className: props.className }, props.children),
    useLocation: () => ["/programme-portal", mocks.navigate],
  };
});

const workspace = (role: Workspace["role"] = "owner", programme: Workspace["programme"] = "business"): Workspace => ({
  programme,
  applicationId: 31,
  displayName: programme === "business" ? "Kampala Systems" : "Miriam Affiliate",
  status: "active",
  role,
  reviewNotes: null,
  tier: programme === "business" ? "authorized" : null,
  commissionPercent: programme === "business" ? 20 : 10,
  registrationStatus: "verified",
  registrationNumber: "UG-REG-8472",
  registrationCountry: "Uganda",
  payoutMethod: "mobile_money",
  referralLink: "https://afroai.example/ref/partner-31",
  stats: {
    clicks: 18,
    signups: 4,
    payingCustomers: 2,
    finance: [{ currency: "USD", earnedCents: 2810, pendingCents: 1200, approvedCents: 1610, paidCents: 0, reversedCents: 0 }],
  },
});

const detail = (item: Workspace, commissions: Record<string, unknown>[] = []): ProgrammeDetail => ({
  workspace: item,
  application: item.programme === "business"
    ? {
        company_name: item.displayName, contact_name: "Ada Nanyonga", email: "ada@kampala.test", phone: "+256 700 123456",
        website: "https://kampala.example", country: "UG", country_name: "Uganda", city: "Kampala", team_size: 4,
        current_customers: 27, years_in_business: 6, services_offered: "CRM implementation and training",
        why_partner: "Serve local businesses with practical AI.", desired_tier: "premium", date: "2026-06-14",
      }
    : {
        full_name: item.displayName, email: "miriam@example.test", phone: "+256 700 222111", country: "Uganda",
        promotion_method: "Community workshops and video", social_media: "https://social.example/miriam", date: "2026-06-14",
      },
  truncated: false,
  customers: [],
  commissions,
  leads: [],
  payouts: [],
  members: [
    { id: 1, user_id: "owner-user", email: "owner@kampala.test", role: "owner", status: "active" },
    { id: 2, user_id: "sales-user", email: "sales@kampala.test", role: "sales", status: "active" },
  ],
  invitations: [],
  emails: [],
  audit: [],
  resources: [],
});

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.apiRequest.mockResolvedValue({} as Response);
  mocks.toast.mockClear();
  mocks.navigate.mockClear();
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/programme-portal");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

describe("programme workspaces", () => {
  it("accepts an invitation token from the signed-in programme portal", async () => {
    window.history.replaceState({}, "", "/programme-portal?invite=invite-opaque-93");
    const client = makeClient();
    client.setQueryData(["/api/programmes/me"], { workspaces: [], checkedAt: "2026-06-15T12:00:00Z" });
    render(<QueryClientProvider client={client}><ProgrammeWorkspace /></QueryClientProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /Accept invitation/ }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      "POST",
      "/api/programmes/invitations/accept",
      { token: "invite-opaque-93" },
    ));
    expect(mocks.navigate).toHaveBeenCalledWith("/programme-portal");
  });

  it("keeps finance members read-only in the business team controls", async () => {
    const client = makeClient();
    const finance = workspace("finance");
    client.setQueryData(["/api/programmes/me"], { workspaces: [finance], checkedAt: "2026-06-15T12:00:00Z" });
    client.setQueryData(["/api/programmes", "business", finance.applicationId], detail(finance));
    render(<QueryClientProvider client={client}><ProgrammeWorkspace /></QueryClientProvider>);

    await userEvent.click(screen.getByRole("tab", { name: "Team" }));
    expect(await screen.findByText("Invite a teammate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeDisabled();
    expect(screen.queryByRole("option", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("lets an owner change a teammate role through the member PATCH", async () => {
    const client = makeClient();
    const owner = workspace("owner");
    client.setQueryData(["/api/programmes/me"], { workspaces: [owner], checkedAt: "2026-06-15T12:00:00Z" });
    client.setQueryData(["/api/programmes", "business", owner.applicationId], detail(owner));
    render(<QueryClientProvider client={client}><ProgrammeWorkspace /></QueryClientProvider>);

    await userEvent.click(screen.getByRole("tab", { name: "Team" }));
    const role = screen.getByRole("combobox", { name: "Change role for sales@kampala.test" });
    expect(Array.from(role.querySelectorAll("option")).map((option) => option.value)).toEqual(["admin", "finance", "sales"]);
    fireEvent.change(role, { target: { value: "admin" } });
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/programmes/business/31/members/2",
      { role: "admin" },
    ));
  });

  it("submits editable pending business registration and response fields", async () => {
    const client = makeClient();
    const applicant = {
      ...workspace("owner"),
      status: "information_required",
      registrationStatus: "unverified" as const,
      registrationNumber: "OLD-REG",
      registrationCountry: "Uganda",
    };
    client.setQueryData(["/api/programmes/me"], { workspaces: [applicant], checkedAt: "2026-06-15T12:00:00Z" });
    client.setQueryData(["/api/programmes", "business", applicant.applicationId], detail(applicant));
    render(<QueryClientProvider client={client}><ProgrammeWorkspace /></QueryClientProvider>);

    fireEvent.change(screen.getByLabelText("Business registration number"), { target: { value: "NEW-REG-992" } });
    fireEvent.change(screen.getByLabelText("Registration country"), { target: { value: "Kenya" } });
    fireEvent.change(screen.getByLabelText("Response to requested information"), { target: { value: "Updated registration details supplied." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit response for review" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/programmes/business/31/profile",
      {
        payoutMethod: "mobile_money",
        registrationNumber: "NEW-REG-992",
        registrationCountry: "Kenya",
        response: "Updated registration details supplied.",
      },
    ));
    expect(screen.getByText(/returns your application to pending review/)).toBeInTheDocument();
    expect(screen.getByText("CRM implementation and training")).toBeInTheDocument();
  });

  it("keeps verified business identity read-only after approval", async () => {
    const client = makeClient();
    const approved = { ...workspace("owner"), status: "approved", registrationStatus: "verified" as const };
    client.setQueryData(["/api/programmes/me"], { workspaces: [approved], checkedAt: "2026-06-15T12:00:00Z" });
    client.setQueryData(["/api/programmes", "business", approved.applicationId], detail(approved));
    render(<QueryClientProvider client={client}><ProgrammeWorkspace /></QueryClientProvider>);

    expect(await screen.findByText("UG-REG-8472")).toBeInTheDocument();
    expect(screen.getByText(/locked after approval/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Business registration number")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Registration country")).not.toBeInTheDocument();
  });

  it("allows affiliate applicants to submit requested information", async () => {
    const client = makeClient();
    const applicant = { ...workspace("owner", "affiliate"), status: "information_required" };
    client.setQueryData(["/api/programmes/me"], { workspaces: [applicant], checkedAt: "2026-06-15T12:00:00Z" });
    client.setQueryData(["/api/programmes", "affiliate", applicant.applicationId], detail(applicant));
    render(<QueryClientProvider client={client}><ProgrammeWorkspace /></QueryClientProvider>);

    fireEvent.change(screen.getByLabelText("Response to requested information"), { target: { value: "Here is the requested audience information." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit response for review" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/programmes/affiliate/31/profile",
      { payoutMethod: "mobile_money", response: "Here is the requested audience information." },
    ));
    expect(screen.getByText("Community workshops and video")).toBeInTheDocument();
  });

  it("shows founder business registration and requires confirmation before recording an offline payout", async () => {
    const client = makeClient();
    const item = workspace("owner", "business");
    const params = "/api/founder/programmes?programme=business&page=1";
    const commissions = [{ id: 42, currency: "USD", amount_cents: 1290, status: "approved" }];
    const stats = {
      applications: 1, pending: 0, approved: 1, rejected: 0, active: 1, suspended: 0,
      clicks: 18, signups: 4, payingCustomers: 2, finance: item.stats.finance, emailsPending: 0, emailsUncertain: 0,
    };
    client.setQueryData(["/api/founder/programmes?programme=affiliate&page=1"], {
      items: [], total: 0, page: 1, pageSize: 25, checkedAt: "2026-06-15T12:00:00Z", stats,
    });
    client.setQueryData([params], {
      items: [item],
      total: 1,
      page: 1,
      pageSize: 25,
      rangeBasis: "application_submission_date",
      checkedAt: "2026-06-15T12:00:00Z",
      stats,
    });
    client.setQueryData(["/api/founder/programmes/business/31"], detail(item, commissions));
    render(<QueryClientProvider client={client}><FounderProgrammes /></QueryClientProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Business" }));
    expect(screen.getByText(/Date range basis: application submission date/)).toBeInTheDocument();
    expect(screen.getByText(/Financial totals aggregate the applications selected by this filter/)).toBeInTheDocument();
    expect(screen.getByText(/Finance by currency · formatted from cents/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Kampala Systems/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Kampala Systems/ }));
    expect(await screen.findByText("UG-REG-8472")).toBeInTheDocument();
    expect(screen.getByText("Uganda", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/Amount \(formatted currency\):/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "USD" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Commission #42/ }));
    fireEvent.change(screen.getByPlaceholderText("Offline payment reference"), { target: { value: "offline-ref-081" } });

    const recordPayment = screen.getByRole("button", { name: "Record payment made manually" });
    expect(recordPayment).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I confirm I already sent this payment manually/ }));
    expect(recordPayment).toBeEnabled();
    fireEvent.click(recordPayment);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      "POST",
      "/api/founder/programmes/business/31/payouts",
      expect.objectContaining({
        currency: "USD",
        commissionIds: [42],
        method: "bank",
        reference: "offline-ref-081",
        confirmation: "PAID MANUALLY",
      }),
    ));
  });

  it("opens the exact founder email deep link without needing the applicant in the first list page", async () => {
    window.history.replaceState({}, "", "/founder?programme=business&application=842");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    const client = makeClient();
    const item = { ...workspace("owner"), applicationId: 842, displayName: "Lake Victoria Robotics" };
    const stats = {
      applications: 26, pending: 7, approved: 13, rejected: 4, active: 11, suspended: 2,
      clicks: 81, signups: 19, payingCustomers: 8, finance: item.stats.finance, emailsPending: 0, emailsUncertain: 0,
    };
    client.setQueryData(["/api/founder/programmes?programme=business&page=1"], {
      items: [], total: 26, page: 1, pageSize: 25, checkedAt: "2026-06-15T12:00:00Z", stats,
    });
    client.setQueryData(["/api/founder/programmes/business/842"], detail(item));
    render(<QueryClientProvider client={client}><FounderProgrammes /></QueryClientProvider>);

    expect(await screen.findByText("Application review · Lake Victoria Robotics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Business" })).toHaveClass("bg-primary");
    expect(screen.getByText("Serve local businesses with practical AI.")).toBeInTheDocument();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }));
  });
});
