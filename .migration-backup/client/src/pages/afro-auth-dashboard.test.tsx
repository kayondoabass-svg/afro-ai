import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  authState: { user: null as any, isLoading: true },
  navigate: vi.fn(),
  toast: vi.fn(),
  apiRequest: vi.fn(),
  authAdminRequest: vi.fn(),
  library: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("wouter", () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  useLocation: () => ["/dashboard/auth", mocks.navigate],
}));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return {
    apiRequest: mocks.apiRequest,
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  };
});
vi.mock("@/lib/afro-auth-admin", () => ({ authAdminRequest: mocks.authAdminRequest }));

import AfroAuthDashboardPage from "./afro-auth-dashboard";
import { queryClient } from "@/lib/queryClient";

const sourceProject = { id: 41, name: "Lakeside Market", description: "", type: "website", status: "published" };
const ownedApp = { id: 73, title: "Market", subdomain: "lakeside-market", customDomain: null };

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AfroAuthDashboardPage />
    </QueryClientProvider>,
  );
}

function setHandoffUrl() {
  window.history.pushState({}, "", "/dashboard/auth?projectId=41&appId=73");
}

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryDefaults(["/api/projects"], { queryFn: async () => [sourceProject] });
  queryClient.setQueryDefaults(["/api/published-apps"], { queryFn: async () => [ownedApp] });
  mocks.library.mockReset().mockResolvedValue({ apps: [{ key: "project-41", project: sourceProject, conversationId: 902, publishedApps: [ownedApp] }] });
  queryClient.setQueryDefaults(["/api/app-library"], { queryFn: mocks.library });
  mocks.authState = { user: null, isLoading: true };
  mocks.navigate.mockReset();
  mocks.toast.mockReset();
  mocks.apiRequest.mockReset().mockResolvedValue(Response.json({ project: sourceProject, conversationId: 902 }));
  mocks.authAdminRequest.mockReset().mockImplementation(async (_path: string, name?: string) => {
    return name ? { id: "tenant-new", slug: "lakeside-market-auth", name, plan: "free", created_at: Date.now() } : { tenants: [] };
  });
  setHandoffUrl();
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  window.history.pushState({}, "", "/dashboard/auth");
});

describe("Afro Auth project handoff", () => {
  it("links to setup and exposes owned projects as keyboard-accessible links without creating anything", async () => {
    mocks.authState = { user: { id: "owner-1" }, isLoading: false };
    window.history.pushState({}, "", "/dashboard/auth");
    mocks.authAdminRequest.mockResolvedValue({
      tenants: [{ id: "tenant-owned", slug: "owned-app", name: "Owned App", plan: "free", created_at: 0 }],
    });
    renderPage();
    expect(screen.getByRole("link", { name: /Read setup guide/ })).toHaveAttribute("href", "/docs/auth#start");
    const project = await screen.findByRole("link", { name: "Manage Owned App Afro Auth project" });
    expect(project).toHaveAttribute("href", "/dashboard/auth/tenant-owned");
    project.focus();
    expect(project).toHaveFocus();
    expect(mocks.authAdminRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authAdminRequest).toHaveBeenCalledWith("/cf-auth/v1/admin/tenants");
  });

  it("keeps hook order stable when auth transitions from loading to signed in", async () => {
    const view = renderPage();
    expect(screen.queryByTestId("text-page-title")).not.toBeInTheDocument();
    mocks.authState = { user: { id: "owner-1" }, isLoading: false };
    expect(() => view.rerender(
      <QueryClientProvider client={queryClient}><AfroAuthDashboardPage /></QueryClientProvider>,
    )).not.toThrow();
    expect(await screen.findByTestId("input-project-name")).toHaveValue(sourceProject.name);
    await waitFor(() => expect(mocks.library).toHaveBeenCalled());
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it("rejects a pair of separately owned but unrelated project and live app records", async () => {
    mocks.authState = { user: { id: "owner-1" }, isLoading: false };
    mocks.library.mockResolvedValue({ apps: [{ key: "project-99", project: { ...sourceProject, id: 99 }, conversationId: 903, publishedApps: [ownedApp] }] });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed as a source pair");
    expect(screen.queryByTestId("input-project-name")).not.toBeInTheDocument();
    expect(mocks.authAdminRequest).toHaveBeenCalledWith("/cf-auth/v1/admin/tenants");
  });

  it("prefills a validated source name but creates a tenant only after explicit confirmation", async () => {
    mocks.authState = { user: { id: "owner-1" }, isLoading: false };
    renderPage();
    const nameInput = await screen.findByTestId("input-project-name");
    expect(nameInput).toHaveValue(sourceProject.name);
    expect(mocks.authAdminRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authAdminRequest).toHaveBeenCalledWith("/cf-auth/v1/admin/tenants");

    fireEvent.click(screen.getByTestId("button-confirm-create"));
    await waitFor(() => expect(mocks.authAdminRequest).toHaveBeenCalledWith("/cf-auth/v1/admin/tenants", sourceProject.name));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard/auth/tenant-new?appId=73"));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("login is not enabled automatically"),
    }));
  });
});
