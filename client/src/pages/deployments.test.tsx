import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/deployments", mocks.navigate] }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return {
    apiRequest: mocks.apiRequest,
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  };
});

import DeploymentsPage from "./deployments";
import { queryClient } from "@/lib/queryClient";

const app = {
  id: 73,
  userId: "owner-1",
  title: "Lakeside Market",
  subdomain: "lakeside-market",
  htmlContent: "<main>Market</main>",
  appStatus: "active",
  customDomain: null,
  customDomainVerified: false,
  createdAt: new Date("2026-06-01T12:00:00.000Z"),
  updatedAt: new Date("2026-06-02T12:00:00.000Z"),
};

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryDefaults(["/api/published-apps"], { queryFn: async () => [app] });
  mocks.navigate.mockReset();
  mocks.toast.mockReset();
  mocks.apiRequest.mockReset().mockResolvedValue(Response.json({
    project: { id: 41 },
    conversationId: 902,
    sourceSyncWarning: "Some generated files could not be restored.",
  }));
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

function renderDeployments() {
  return render(
    <QueryClientProvider client={queryClient}>
      <DeploymentsPage />
    </QueryClientProvider>,
  );
}

describe("published app source actions", () => {
  it("opens the recovered source conversation and retains existing deployment controls", async () => {
    renderDeployments();
    fireEvent.click(await screen.findByTestId("button-open-build-73"));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/published-apps/73/project"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/chat?projectId=41&conversationId=902"));
    expect(screen.getByTestId("button-history-73")).toBeInTheDocument();
    expect(screen.getByTestId("button-connect-domain-73")).toBeInTheDocument();
    expect(screen.getByTestId("button-expand-73")).toBeInTheDocument();
    expect(screen.getByTestId("button-delete-app-73")).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Source recovery warning",
      description: "Some generated files could not be restored.",
    }));
  });

  it("starts the Afro Auth handoff with the recovered project and published app ids", async () => {
    renderDeployments();
    fireEvent.click(await screen.findByTestId("button-add-auth-73"));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard/auth?projectId=41&appId=73"));
    expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/published-apps/73/project");
  });
});
