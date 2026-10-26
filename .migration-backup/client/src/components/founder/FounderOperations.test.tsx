import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FounderOperations, safeFounderAppHref } from "./FounderOperations";

const useQueryMock = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({ useQuery: useQueryMock }));

const overview = {
  checkedAt: "2025-01-02T12:00:00.000Z",
  sections: [{ id: "users", label: "Users", count: null, status: "unavailable" as const }],
  health: { database: "ok" as const, schema: "unavailable" as const, release: null, emailProvider: "configured", providerConnectivity: "Configuration only; connectivity is not tested." },
  alerts: [{ id: "a1", severity: "warning" as const, title: "User records need attention", section: "users" }],
  finance: { collectedCents: null, paygBalanceCents: 345, paygSpentCents: null, providerCostCents: null },
  links: [{ label: "Unsafe destination", href: "javascript:alert(1)" }],
};
const records = {
  section: "users", label: "Users", columns: [
    { key: "id", label: "ID" }, { key: "email", label: "Email" }, { key: "user_id", label: "User ID" },
    { key: "project_ids", label: "Project IDs" }, { key: "tenant_id", label: "Tenant ID" },
    { key: "tokens_used", label: "Tokens used" }, { key: "used_tokens", label: "Used tokens" },
    { key: "active_credentials", label: "Active credentials" }, { key: "api_key_id", label: "API key ID" },
    { key: "api_key", label: "API key" }, { key: "access_token", label: "Access token" },
  ],
  rows: [{
    id: 17, email: "founder-safe@example.test", user_id: "user-9", project_ids: ["email-project-1", "email-project-2"],
    tenant_id: "tenant-3", tokens_used: 12, used_tokens: 9, active_credentials: 2, api_key_id: "key-17",
    api_key: "secret-key-value", access_token: "secret-token-value",
  }],
  page: 1, pageSize: 25 as const, total: 1, statuses: ["active"], checkedAt: "2025-01-02T12:00:00.000Z",
};

describe("FounderOperations", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("does not request or render founder data for a non-founder", () => {
    useQueryMock.mockReturnValue({ data: undefined, isPending: false, isError: false });
    const { container } = render(<FounderOperations isFounder={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(useQueryMock).toHaveBeenCalled();
    expect(useQueryMock.mock.calls.every(([options]) => options.enabled === false)).toBe(true);
  });

  it("shows loading and retryable unavailable states", () => {
    useQueryMock.mockReturnValue({ isPending: true });
    const { rerender } = render(<FounderOperations isFounder />);
    expect(screen.getByLabelText("Loading platform overview")).toBeInTheDocument();

    const retry = vi.fn();
    useQueryMock.mockReset().mockReturnValue({ isError: true, isPending: false, refetch: retry });
    rerender(<FounderOperations isFounder />);
    fireEvent.click(screen.getByRole("button", { name: "Retry overview" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("opens safe read-only records from alerts and applies owner and status filters", async () => {
    const calls: unknown[] = [];
    useQueryMock.mockImplementation((options?: { queryKey?: string[]; enabled?: boolean }) => {
      const key = options?.queryKey?.[0] || "";
      calls.push(key);
      if (key === "/api/founder/overview") return { data: overview, isPending: false };
      return { data: records, isPending: false, isFetching: false, refetch: vi.fn() };
    });
    render(<FounderOperations isFounder />);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Unsafe destination/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Configuration-only provider note; connectivity has not been tested/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /User records need attention/ }));
    expect(await screen.findByText("founder-safe@example.test")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("key-17")).toBeInTheDocument();
    expect(screen.queryByText("secret-key-value")).not.toBeInTheDocument();
    expect(screen.queryByText("secret-token-value")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter by owner"), { target: { value: "owner-7" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Filter by status" }));
    fireEvent.click(await screen.findByRole("option", { name: "active" }));
    await waitFor(() => expect(calls.some(value => String(value).includes("owner=owner-7"))).toBe(true));
    expect(calls.some(value => String(value).includes("status=active"))).toBe(true);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("includes the persisted founder action history record set", () => {
    useQueryMock.mockImplementation((options?: { queryKey?: string[] }) => {
      if (options?.queryKey?.[0] === "/api/founder/overview") return { data: overview, isPending: false };
      return { isPending: true };
    });
    render(<FounderOperations isFounder />);
    expect(screen.getByRole("button", { name: /Founder action history/ })).toBeInTheDocument();
  });

  it("navigates related IDs and per-row details using read-only record filters", async () => {
    const calls: string[] = [];
    useQueryMock.mockImplementation((options?: { queryKey?: string[] }) => {
      const key = options?.queryKey?.[0] || "";
      calls.push(key);
      return key === "/api/founder/overview" ? { data: overview, isPending: false } : { data: records, isPending: false, isFetching: false, refetch: vi.fn() };
    });
    render(<FounderOperations isFounder initialSection="email-logs" />);
    fireEvent.click(await screen.findByRole("button", { name: "Open email-projects record email-project-1" }));
    await waitFor(() => expect(calls.some(url => url.includes("/email-projects?") && url.includes("id=email-project-1"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Open auth-projects record tenant-3" }));
    await waitFor(() => expect(calls.some(url => url.includes("/auth-projects?") && url.includes("id=tenant-3"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "View details for record 17" }));
    await waitFor(() => expect(calls.some(url => url.includes("/auth-projects?") && url.includes("id=17"))).toBe(true));
  });

  it("builds only validated HTTPS host-only app destinations", () => {
    expect(safeFounderAppHref({ subdomain: "afro-demo" })).toBe("https://afro-demo.afroaigroup.com");
    expect(safeFounderAppHref({ custom_domain: "https://example.test", custom_domain_verified: true })).toBe("https://example.test");
    expect(safeFounderAppHref({ custom_domain: "javascript:alert(1)", custom_domain_verified: true, subdomain: "afro-demo" })).toBeNull();
    expect(safeFounderAppHref({ custom_domain: "https://example.test/path", custom_domain_verified: true })).toBeNull();
    expect(safeFounderAppHref({ custom_domain: "unverified.test", subdomain: "afro-demo" })).toBe("https://afro-demo.afroaigroup.com");
  });
});
