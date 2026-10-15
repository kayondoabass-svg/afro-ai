import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "library-owner" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/deployments", mocks.navigate] }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return {
    apiRequest: mocks.apiRequest,
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  };
});

import DeploymentsPage from "./my-apps-library";
import { queryClient } from "@/lib/queryClient";

const project = {
  id: 41, name: "Lakeside Market", type: "website", status: "in_progress",
  description: "Market storefront", createdAt: new Date("2026-06-01T12:00:00.000Z"),
};
const app = {
  id: 73,
  userId: "library-owner",
  title: "Lakeside Market",
  subdomain: "lakeside-market",
  htmlContent: "<main>Market</main>",
  appStatus: "active",
  suspendReason: null,
  customDomain: null,
  customDomainVerified: false,
  createdAt: new Date("2026-06-01T12:00:00.000Z"),
  updatedAt: new Date("2026-06-02T12:00:00.000Z"),
};
const orphan = { ...app, id: 75, title: "Recovered market", subdomain: "recovered-market" };

beforeEach(() => {
  queryClient.clear();
  window.history.replaceState({}, "", "/deployments");
  queryClient.setQueryDefaults(["/api/app-library"], { queryFn: async () => ({ apps: [
    { key: "project-41", project, conversationId: 902, publishedApps: [app] },
    { key: "orphan-75", project: null, conversationId: null, publishedApps: [orphan] },
  ] }) });
  mocks.navigate.mockReset();
  mocks.toast.mockReset();
  mocks.apiRequest.mockReset().mockImplementation(async (method: string, path: string) => {
    if (method === "POST" && path === "/api/projects/reconcile-published") return Response.json({ failures: 0 });
    if (method === "POST" && path === "/api/published-apps/75/project") return Response.json({
      project: { id: 45 }, conversationId: 903, sourceSyncWarning: "Some generated files could not be restored.",
    });
    return Response.json({ ok: true });
  });
});

afterEach(() => { cleanup(); queryClient.clear(); });

function renderDeployments() {
  return render(<QueryClientProvider client={queryClient}><DeploymentsPage /></QueryClientProvider>);
}

describe("unified My Apps library", () => {
  it("opens the requested publication from the email manage deep link", async () => {
    window.history.replaceState({}, "", "/deployments?appId=73");
    renderDeployments();
    expect(await screen.findByText("Open website")).toBeInTheDocument();
    expect(screen.getByTestId("card-library-project-41")).toBeInTheDocument();
  });

  it("opens the linked project conversation and retains publication management controls", async () => {
    renderDeployments();
    fireEvent.click(await screen.findByTestId("button-open-build-project-41"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/chat?projectId=41&conversation=902"));
    expect(screen.getByTestId("button-history-73")).toBeInTheDocument();
    expect(screen.getByTestId("button-connect-domain-73")).toBeInTheDocument();
    expect(screen.getByTestId("button-details-project-41")).toBeInTheDocument();
    expect(screen.getByTestId("button-add-auth-73")).toBeInTheDocument();
    expect(screen.getByTestId("button-delete-project-41")).toBeInTheDocument();
    expect(mocks.apiRequest).not.toHaveBeenCalledWith("POST", "/api/published-apps/73/project");
  });

  it("recovers an orphan through the published-app project endpoint with project-scoped navigation", async () => {
    renderDeployments();
    fireEvent.click(await screen.findByTestId("button-recover-orphan-75"));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/published-apps/75/project"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/chat?projectId=45&conversation=903"));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Source recovery warning",
      description: "Some generated files could not be restored.",
    }));
  });

  it("requires typed DELETE and sends the exact confirmation body for project deletion", async () => {
    renderDeployments();
    fireEvent.click(await screen.findByTestId("button-delete-project-41"));
    const confirm = screen.getByTestId("button-confirm-library-delete");
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("input-library-delete-confirm"), { target: { value: "DELETE" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("DELETE", "/api/projects/41", { confirmation: "DELETE" }));
  });

  it("keeps deletion-pending identifiable and routes its retry back through typed DELETE", async () => {
    queryClient.setQueryDefaults(["/api/app-library"], { queryFn: async () => ({ apps: [
      { key: "project-41", project, conversationId: 902, publishedApps: [{ ...app, suspendReason: "deletion-pending", appStatus: "suspended" }] },
    ] }) });
    queryClient.setQueryData(["/api/app-library"], { apps: [
      { key: "project-41", project, conversationId: 902, publishedApps: [{ ...app, suspendReason: "deletion-pending", appStatus: "suspended" }] },
    ] });
    renderDeployments();
    fireEvent.click(await screen.findByTestId("button-retry-cleanup-73"));
    const confirm = screen.getByTestId("button-confirm-library-delete");
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("input-library-delete-confirm"), { target: { value: "DELETE" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("DELETE", "/api/projects/41", { confirmation: "DELETE" }));
  });

  it("offers a distinct unpublish confirmation and preserves source project identity", async () => {
    renderDeployments();
    fireEvent.click(await screen.findByTestId("button-unpublish-73"));
    fireEvent.click(screen.getByTestId("button-confirm-unpublish"));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/published-apps/73/unpublish", { confirmation: "UNPUBLISH" }));
  });

  it("retries pending unpublish directly without presenting the site as live", async () => {
    const pending = { ...app, appStatus: "suspended", suspendReason: "unpublish-pending" };
    queryClient.setQueryDefaults(["/api/app-library"], { queryFn: async () => ({ apps: [
      { key: "project-41", project, conversationId: 902, publishedApps: [pending] },
    ] }) });
    queryClient.setQueryData(["/api/app-library"], { apps: [
      { key: "project-41", project, conversationId: 902, publishedApps: [pending] },
    ] });
    renderDeployments();
    expect(await screen.findByText("Unpublish pending")).toBeInTheDocument();
    expect(screen.queryByTestId("button-unpublish-73")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-retry-unpublish-73"));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/published-apps/73/unpublish", { confirmation: "UNPUBLISH" }));
  });
});
