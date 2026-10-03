import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), toast: vi.fn(), apiRequest: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { firstName: "Amina", plan: "business" } }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/dashboard", mocks.navigate] }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { apiRequest: mocks.apiRequest, queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) };
});
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <select aria-label="Project type" value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

import DashboardPage from "./dashboard";
import { queryClient } from "@/lib/queryClient";

const project = { id: 81, name: "Kampala Studio", description: "Never autogenerate", type: "fullstack", status: "draft", createdAt: "2026-06-15" };
beforeEach(() => {
  queryClient.clear();
  mocks.apiRequest.mockReset();
  mocks.navigate.mockReset();
  mocks.toast.mockReset();
  queryClient.setQueryDefaults(["/api/projects"], { queryFn: async () => [] });
  queryClient.setQueryDefaults(["/api/published-apps"], { queryFn: async () => [] });
  queryClient.setQueryDefaults(["/api/projects/fullstack-access"], { queryFn: async () => ({ allowed: true, reason: "Paid access verified" }) });
});
afterEach(() => { cleanup(); queryClient.clear(); });

async function openFullstackForm() {
  render(<QueryClientProvider client={queryClient}><DashboardPage /></QueryClientProvider>);
  fireEvent.click(screen.getByTestId("button-new-project"));
  fireEvent.change(screen.getByRole("combobox", { name: "Project type" }), { target: { value: "fullstack" } });
  fireEvent.change(screen.getByTestId("input-project-name"), { target: { value: project.name } });
}

describe("dashboard paid full-stack creation", () => {
  it.each(["setup_failed", "initializing"])("offers paid-gated retry for %s without opening or duplicating the project", async (status) => {
    queryClient.setQueryDefaults(["/api/projects"], { queryFn: async () => [{ ...project, status }] });
    queryClient.setQueryDefaults(["/api/projects/fullstack-access"], { queryFn: async () => ({ allowed: false, reason: "Paid access required" }) });
    render(<QueryClientProvider client={queryClient}><DashboardPage /></QueryClientProvider>);
    const retry = await screen.findByTestId("button-retry-setup-81");
    expect(retry).toBeDisabled();
    fireEvent.click(screen.getByTestId("card-project-81"));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    if (status === "initializing") expect(screen.getByText(/If progress has stalled/)).toBeInTheDocument();
    queryClient.setQueryData(["/api/projects/fullstack-access"], { allowed: true, reason: "Paid access verified" });
    await waitFor(() => expect(retry).not.toBeDisabled());
    mocks.apiRequest.mockRejectedValue(new Error('409: {"message":"Setup is already running. Please wait."}'));
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/projects/81/initialize"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Setup is already running. Please wait." })));
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(retry).not.toBeDisabled());
  });

  it.each(["loading", "denied", "error"])("fails closed on %s even for a business-plan user", async (state) => {
    queryClient.setQueryDefaults(["/api/projects/fullstack-access"], { queryFn: () => {
      if (state === "loading") return new Promise(() => {});
      if (state === "error") throw new Error("Access service unavailable");
      return { allowed: false, reason: "A paid subscription is required." };
    } });
    await openFullstackForm();
    await waitFor(() => expect(screen.getByTestId("button-submit-project")).toBeDisabled());
    if (state === "error") expect(await screen.findByRole("button", { name: "Retry access check" })).toBeInTheDocument();
    if (state === "denied") expect(await screen.findByText("A paid subscription is required.")).toBeInTheDocument();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it("opens the saved starter in project mode without a description query", async () => {
    mocks.apiRequest.mockResolvedValue(Response.json(project));
    await openFullstackForm();
    await waitFor(() => expect(screen.getByTestId("button-submit-project")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-submit-project"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/chat?projectId=81&project=Kampala%20Studio&projectMode=fullstack"));
    expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/projects", expect.objectContaining({ type: "fullstack" }));
  });

  it("closes partial creation, refreshes cards and tells the user to retry rather than duplicate", async () => {
    const failed = { ...project, status: "setup_failed" };
    mocks.apiRequest.mockRejectedValue(new Error(`503: ${JSON.stringify({ message: "Starter storage unavailable", project: failed })}`));
    await openFullstackForm();
    await waitFor(() => expect(screen.getByTestId("button-submit-project")).not.toBeDisabled());
    queryClient.setQueryDefaults(["/api/projects"], { queryFn: async () => [failed] });
    fireEvent.click(screen.getByTestId("button-submit-project"));
    await waitFor(() => expect(screen.queryByTestId("button-submit-project")).not.toBeInTheDocument());
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Starter storage unavailable") }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Retry setup on its card") }));
    expect(await screen.findByTestId("button-retry-setup-81")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("card-project-81"));
    expect(mocks.navigate).not.toHaveBeenCalled();
    mocks.apiRequest.mockResolvedValue(Response.json(project));
    fireEvent.click(screen.getByTestId("button-retry-setup-81"));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/projects/81/initialize"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/chat?projectId=81&project=Kampala%20Studio&projectMode=fullstack"));
  });
});