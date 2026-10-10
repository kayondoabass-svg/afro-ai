import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import KeyoStudioAdmin from "@/pages/keyo-studio-admin";

const state = vi.hoisted(() => ({ userId: "founder-user", founder: true, denied: false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: state.userId } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/queryClient")>(), apiRequest: vi.fn(),
}));
const request = vi.mocked(apiRequest);
beforeEach(() => {
  queryClient.clear();
  state.userId = "founder-user"; state.founder = true; state.denied = false;
  request.mockImplementation(async method => {
    if (state.denied) throw new Error("403: Private dashboard");
    return {
      json: async () => ({
        isFounder: state.founder, authorizedUsersCount: 2, activeViewersCount: 1, presenceWindowSeconds: 90,
        invites: state.founder ? [{ email: "viewer@example.test", createdAt: "2026-10-11T00:00:00Z" }] : [],
        release: { version: "test-alpha", stage: "developer-alpha", downloadUrl: "/downloads/keyo-studio/test.tgz" },
        publicLinks: { github: "https://github.com/example/keyo", huggingFace: "https://huggingface.co/spaces/example/keyo" },
      }),
      ok: true, status: method === "GET" ? 200 : 204,
    } as Response;
  });
});
afterEach(() => { cleanup(); queryClient.clear(); request.mockReset(); });
function view() { return render(<QueryClientProvider client={queryClient}><KeyoStudioAdmin /></QueryClientProvider>); }

describe("KEYO private dashboard UI", () => {
  it("renders actual release data and founder email grant controls", async () => {
    view();
    expect(await screen.findByText("vtest-alpha")).toBeInTheDocument();
    expect(screen.getByText("viewer@example.test")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Email address to invite" });
    fireEvent.change(input, { target: { value: "new@example.test" } });
    const button = screen.getByRole("button", { name: /grant|add|invite/i });
    fireEvent.click(button);
    await waitFor(() => expect(request).toHaveBeenCalledWith("POST", "/api/keyo-studio/admin/invites", { email: "new@example.test" }));
  });
  it("shows no invite management to a viewer", async () => {
    state.founder = false; state.userId = "viewer-user";
    view();
    expect(await screen.findByText("vtest-alpha")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email address to invite" })).not.toBeInTheDocument();
    expect(screen.queryByText("viewer@example.test")).not.toBeInTheDocument();
  });
  it("does not reveal release or invitation data after access is denied", async () => {
    state.denied = true;
    view();
    expect(await screen.findByText("Private access only")).toBeInTheDocument();
    expect(screen.queryByText("vtest-alpha")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email address to invite" })).not.toBeInTheDocument();
  });
});
