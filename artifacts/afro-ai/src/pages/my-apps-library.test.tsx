import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MyAppsLibraryPage from "./my-apps-library";
import { MY_APPS_ROUTE_ALIASES, recommendationHref } from "@/lib/my-apps-routes";
import { AppHandoffContext } from "@/components/app-handoff-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  library: { apps: [] as any[] },
  mutate: vi.fn(),
  navigate: vi.fn(),
  invalidateQueries: vi.fn(),
  apiRequest: vi.fn(async () => ({ json: async () => ({}) })),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({ data: mocks.library, isLoading: false, isError: false, refetch: vi.fn() }),
    useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
  };
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: mocks.apiRequest,
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/deployments", mocks.navigate] }));

const project = { id: 7, name: "Kampala Pantry", description: "A neighborhood food shop", status: "in_progress", createdAt: "2025-01-14T00:00:00Z" };
const publication = { id: 19, title: "Kampala Pantry", subdomain: "kampala-pantry", appStatus: "active", suspendReason: null, createdAt: "2025-02-01T00:00:00Z", updatedAt: "2025-02-02T00:00:00Z", htmlContent: "<html></html>" };

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  mocks.library = { apps: [
    { key: "project-7", project, conversationId: 31, publishedApps: [publication] },
    { key: "project-8", project: { ...project, id: 8, name: "Unpublished draft" }, conversationId: null, publishedApps: [] },
    { key: "orphan-20", project: null, conversationId: null, publishedApps: [{ ...publication, id: 20, title: "Recovered storefront", subdomain: "storefront" }] },
    { key: "project-21", project: { ...project, id: 21, name: "Unpublish retry" }, conversationId: 32, publishedApps: [{ ...publication, id: 21, title: "Unpublish retry", subdomain: "unpublish-retry", appStatus: "suspended", suspendReason: "unpublish-pending" }] },
  ] };
  mocks.mutate.mockClear();
  mocks.navigate.mockClear();
  mocks.apiRequest.mockClear();
});
afterEach(cleanup);

describe("My Apps library", () => {
  it("renders one unified project card with its publication and keeps an orphan explicit", () => {
    render(<MyAppsLibraryPage />);
    expect(screen.getByTestId("card-library-project-7")).toBeInTheDocument();
    expect(screen.getByTestId("text-library-title-project-7")).toHaveTextContent("Kampala Pantry");
    expect(within(screen.getByTestId("card-library-project-7")).getByText("https://kampala-pantry.afroaigroup.com")).toBeInTheDocument();
    expect(screen.getByTestId("button-recover-orphan-20")).toHaveTextContent("Recover source");
  });

  it("opens a linked project with the required projectId and conversation parameters", () => {
    render(<MyAppsLibraryPage />);
    fireEvent.click(screen.getByTestId("button-open-build-project-7"));
    expect(mocks.navigate).toHaveBeenCalledWith("/chat?projectId=7&conversation=31");
  });

  it("filters the combined library into drafts and publications and searches names", () => {
    render(<MyAppsLibraryPage />);
    fireEvent.click(screen.getByTestId("filter-drafts"));
    expect(screen.getByTestId("card-library-project-8")).toBeInTheDocument();
    expect(screen.queryByTestId("card-library-project-7")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("filter-published"));
    expect(screen.getByTestId("card-library-project-7")).toBeInTheDocument();
    expect(screen.getByTestId("card-library-orphan-20")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("input-search-apps"), { target: { value: "recovered" } });
    expect(screen.getByTestId("card-library-orphan-20")).toBeInTheDocument();
    expect(screen.queryByTestId("card-library-project-7")).not.toBeInTheDocument();
  });

  it("requires the exact typed DELETE before calling the project delete mutation", async () => {
    render(<MyAppsLibraryPage />);
    fireEvent.click(screen.getByTestId("button-delete-project-7"));
    const confirm = screen.getByTestId("button-confirm-library-delete");
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("input-library-delete-confirm"), { target: { value: "delete" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("input-library-delete-confirm"), { target: { value: "DELETE" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ kind: "project" })));
  });

  it("offers a retry action for incomplete unpublish cleanup", () => {
    render(<MyAppsLibraryPage />);
    expect(screen.getByText("Unpublish pending")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-retry-unpublish-21"));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 21, suspendReason: "unpublish-pending" }));
  });
});

describe("handoff and compatibility routes", () => {
  it("keeps old deployments and emailed My Apps aliases pointed at the library", () => {
    expect(MY_APPS_ROUTE_ALIASES).toEqual(["/deployments", "/apps", "/my-apps"]);
  });
  it("builds exact recommendation destinations with app and project context", () => {
    const expected: Record<string, string> = {
      domain: "/domains", auth: "/dashboard/auth", email: "/email-api",
      chatbot: "/chatbots", sms: "/integrations", ussd: "/ussd",
    };
    Object.entries(expected).forEach(([key, path]) => {
      expect(recommendationHref(key, { projectId: 7, appId: 19 })).toBe(`${path}?projectId=7&appId=19`);
    });
    expect(recommendationHref("email", {})).toBe("/email-api");
  });
  it("shows the verified selected website and the fields that will be prefilled", async () => {
    window.history.replaceState({}, "", "/email-api?app=19");
    mocks.library = { apps: [{ key: "project-7", project, conversationId: 31, publishedApps: [publication] }] };
    const queryClient = new QueryClient();
    render(<QueryClientProvider client={queryClient}><AppHandoffContext prefilledFields={["API key name"]} /></QueryClientProvider>);
    expect(await screen.findByText("Selected website: kampala-pantry.afroaigroup.com")).toBeInTheDocument();
    expect(screen.getByText(/Prefilled: API key name/)).toBeInTheDocument();
    window.history.replaceState({}, "", "/");
  });
});
