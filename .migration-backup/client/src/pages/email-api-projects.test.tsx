import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ query: vi.fn(), request: vi.fn(), invalidate: vi.fn(), toast: vi.fn(), confirm: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.query,
  useMutation: (options: any) => ({
    mutate: (value?: unknown) => Promise.resolve().then(() => options.mutationFn(value)).then(options.onSuccess).catch(options.onError),
    isPending: false,
    reset: vi.fn(),
  }),
}));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.request, queryClient: { invalidateQueries: mocks.invalidate } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/app-handoff", () => ({ useAppHandoff: () => ({ project: null, valid: false, hostname: null }) }));
vi.mock("@/components/app-handoff-context", () => ({ AppHandoffContext: () => null }));

import EmailApiPage from "./email-api";

const project = { id: "p-1", name: "Product mail", legacy: false, domainCount: 1, keyCount: 1, createdAt: "2025-01-01" };
const key = { id: 41, name: "production", publicKey: "afro_live_public", secretKeyPreview: "••••", plan: "starter", emailsSentMonth: 3, monthlyLimit: 1000, isActive: true, lastUsedAt: null, createdAt: "2025-01-01", revokedAt: null };
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/email-api");
  mocks.confirm.mockReturnValue(true);
  vi.stubGlobal("confirm", mocks.confirm);
  mocks.query.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
    const path = queryKey[0];
    if (path === "/api/email-api/projects") return { data: [project], isLoading: false, isError: false, refetch: vi.fn() };
    if (path === "/api/email-api/projects/p-1") return { data: { project, keys: [key], domains: [{ id: 9, domain: "mail.example.org", status: "verified", createdAt: "2025-01-01", verifiedAt: "2025-01-02" }], logs: [], stats: { totalSent: 3, totalFailed: 0, totalKeys: 1, verifiedDomains: 1, emailsSentThisMonth: 3 } }, isLoading: false };
    if (path.endsWith("/keys")) return { data: [], isLoading: false };
    return { data: [], isLoading: false };
  });
  mocks.request.mockImplementation((method: string, url: string) => ({
    json: async () => url.endsWith("/rotate") ? { ...key, id: 42, secretKey: "one-time-email-secret" } : {},
  }));
});

describe("Email API project key lifecycle", () => {
  it("confirms safe rotation, keeps disable separate from permanent revoke, and never auto-sends a test", async () => {
    render(<EmailApiPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Manage project" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Manage project" }));
    await waitFor(() => expect(screen.getByText("production")).toBeInTheDocument());
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalledWith("POST", expect.stringContaining("/test"), expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Rotate production" }));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("remains active during rollout"));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/email-api/keys/41/rotate", {}));
    expect(await screen.findByText("one-time-email-secret")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I've saved it" }));

    fireEvent.click(screen.getByRole("button", { name: /Disable/ }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("PATCH", "/api/email-api/keys/41/toggle"));
    fireEvent.click(screen.getByRole("button", { name: /Revoke/ }));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("permanently"));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/email-api/keys/41/revoke", { confirm: true }));
    expect(mocks.request.mock.calls.some((call: unknown[]) => String(call[1]).includes("/test"))).toBe(false);
  });

  it.each(["loading", "not-found"] as const)("never leaks account-wide resources while a selected project is %s", async (state) => {
    window.history.replaceState({}, "", "/email-api?project=p-1");
    mocks.query.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      const path = queryKey[0];
      if (path === "/api/email-api/projects") return { data: [project], isLoading: false, isError: false, refetch: vi.fn() };
      if (path === "/api/email-api/projects/p-1") return state === "loading"
        ? { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }
        : { data: undefined, isLoading: false, isError: true, error: new Error("404: project not found"), refetch: vi.fn() };
      if (path.endsWith("/keys")) return { data: [{ ...key, id: 900, name: "ACCOUNT-ONLY SECRET KEY" }], isLoading: false };
      if (path.endsWith("/domains")) return { data: [{ id: 901, domain: "account-only.example.net", status: "verified", createdAt: "2025-01-01", verifiedAt: "2025-01-02" }], isLoading: false };
      return { data: [], isLoading: false };
    });
    render(<EmailApiPage />);
    expect(await screen.findByTestId("selected-project-state")).toBeInTheDocument();
    expect(screen.queryByText("ACCOUNT-ONLY SECRET KEY")).not.toBeInTheDocument();
    expect(screen.queryByText("account-only.example.net")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Domain" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New API Key" })).toBeDisabled();
    if (state === "not-found") expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("clears project query state when returning to the project list", async () => {
    window.history.replaceState({}, "", "/email-api?project=p-1");
    render(<EmailApiPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Back to projects" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Back to projects" }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("project")).toBe(false));
  });
});
