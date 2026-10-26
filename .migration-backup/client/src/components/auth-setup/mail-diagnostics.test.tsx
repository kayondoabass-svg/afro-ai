import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MailDiagnostics } from "@/components/auth-setup/mail-diagnostics";
import { apiRequest } from "@/lib/queryClient";

vi.mock("@/lib/queryClient", async (load) => {
  const actual = await load<typeof import("@/lib/queryClient")>();
  return { ...actual, apiRequest: vi.fn() };
});

afterEach(() => vi.clearAllMocks());

it("shows only returned records and refreshes delivery status only on explicit action", async () => {
  const response = {
    health: { status: "available", checkedAt: 1_700_000_000, message: "Sender service responding" },
    events: [{ id: "evt-1", user_id: "user-1", purpose: "verify", outcome: "accepted", reason: null, message_id: "msg-1", created_at: 1_700_000_000, updated_at: 1_700_000_020 }],
  };
  const request = vi.mocked(apiRequest);
  request.mockResolvedValue({ json: async () => response } as Response);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MailDiagnostics tenantId="tenant-1" active /></QueryClientProvider>);
  expect(await screen.findByText("Sender service responding")).toBeTruthy();
  expect(screen.getByText("accepted")).toBeTruthy();
  expect(request.mock.calls.some(([method]) => method === "POST")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Refresh delivery status" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("POST", "/cf-auth/v1/admin/tenants/tenant-1/mail-status/refresh"));
  expect(screen.getByText(/Accepted means the sending provider accepted a request/)).toBeTruthy();
});

it("renders a genuinely empty event state without fabricated records", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(apiRequest).mockResolvedValueOnce({ json: async () => ({ health: { status: "unconfigured", checkedAt: 0, message: "Not configured" }, events: [] }) } as Response);
  render(<QueryClientProvider client={client}><MailDiagnostics tenantId="tenant-empty" active /></QueryClientProvider>);
  expect(await screen.findByText("No recorded email events")).toBeTruthy();
  expect(screen.queryByTestId("mail-event-undefined")).toBeNull();
});
