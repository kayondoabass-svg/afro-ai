import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmailProjectTest } from "@/components/email-project-test";
import { apiRequest } from "@/lib/queryClient";

vi.mock("@/lib/queryClient", async (load) => {
  const actual = await load<typeof import("@/lib/queryClient")>();
  return { ...actual, apiRequest: vi.fn() };
});

function renderTest() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><EmailProjectTest projectId="project-1" keys={[{ id: 7, name: "live", isActive: true }]} hasVerifiedDomain /></QueryClientProvider>);
}

async function completeForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("From address"), "hello@example.com");
  await user.type(screen.getByLabelText("Recipient"), "person@example.net");
  await user.click(screen.getByLabelText(/I authorize one real email/i));
}

afterEach(() => { vi.clearAllMocks(); });

it("keeps one idempotency key across an ambiguous failure and deliberate retry", async () => {
  const user = userEvent.setup();
  const request = vi.mocked(apiRequest);
  request.mockRejectedValueOnce(new Error('503: {"error":"Provider response timed out","requestId":"request-7"}'))
    .mockResolvedValueOnce({ json: async () => ({ success: true, accepted: true, outcome: "accepted", messageId: "mail-2", requestId: "request-7", replayed: true }) } as Response);
  renderTest();
  await completeForm(user);
  await user.click(screen.getByRole("button", { name: "Send one test email" }));
  expect(await screen.findByText(/Provider response timed out/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send one test email" }).hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[0][3]?.["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(request.mock.calls[1][3]).toEqual(request.mock.calls[0][3]);
  expect((await screen.findAllByText(/Accepted by the provider/)).length).toBeGreaterThan(0);
});

it("reports uncertain success without claiming delivery", async () => {
  const user = userEvent.setup();
  vi.mocked(apiRequest).mockResolvedValueOnce({ json: async () => ({ success: true, accepted: false, outcome: "uncertain", requestId: "request-8" }) } as Response);
  renderTest();
  await completeForm(user);
  await user.click(screen.getByRole("button", { name: "Send one test email" }));
  expect(await screen.findByText(/provider outcome is uncertain/i)).toBeTruthy();
  expect(screen.getByText(/Delivery is not confirmed/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry same request" })).toBeTruthy();
});

it("treats accepted true as confirmed provider acceptance even while status is uncertain", async () => {
  const user = userEvent.setup();
  vi.mocked(apiRequest).mockResolvedValueOnce({ json: async () => ({ success: true, accepted: true, outcome: "uncertain", requestId: "provider-ref-9" }) } as Response);
  renderTest();
  await completeForm(user);
  await user.click(screen.getByRole("button", { name: "Send one test email" }));
  expect((await screen.findAllByText(/Accepted by the provider/)).length).toBeGreaterThan(0);
  expect(screen.getByText(/Delivery status or logging is still uncertain/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Retry same request" })).toBeNull();
});

it("uses a fresh idempotency key after a definite provider rejection", async () => {
  const user = userEvent.setup();
  const request = vi.mocked(apiRequest);
  request.mockRejectedValueOnce(new Error('503: {"error":"Provider rejected the message","code":"EMAIL_PROVIDER_REJECTED","requestId":"provider-ref-1"}'))
    .mockResolvedValueOnce({ json: async () => ({ success: true, accepted: true, outcome: "accepted", requestId: "provider-ref-2" }) } as Response);
  renderTest();
  await completeForm(user);
  await user.click(screen.getByRole("button", { name: "Send one test email" }));
  expect(await screen.findByText(/definitively rejected/i)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Send one test email" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  const firstKey = request.mock.calls[0][3]?.["Idempotency-Key"];
  const secondKey = request.mock.calls[1][3]?.["Idempotency-Key"];
  expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(secondKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(secondKey).not.toBe(firstKey);
});
