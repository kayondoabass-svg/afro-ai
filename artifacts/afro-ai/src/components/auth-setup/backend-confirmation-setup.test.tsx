import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BackendConfirmationSetup } from "./backend-confirmation-setup";

const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../../examples/afro-auth-backend/server.mjs?raw", () => ({ default: "export default sample" }));
vi.mock("@/lib/queryClient", async (original) => ({
  ...await original<typeof import("@/lib/queryClient")>(),
  apiRequest: api.apiRequest,
}));

const response = (body: unknown) => ({ json: async () => body });
afterEach(() => { document.body.innerHTML = ""; vi.clearAllMocks(); });

function render() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<QueryClientProvider client={queryClient}><BackendConfirmationSetup tenantId="tenant-x" /></QueryClientProvider>));
  return { container, queryClient, close: () => { act(() => root.unmount()); queryClient.clear(); container.remove(); } };
}

it("loads the configured flow, explains the secure handoff, and saves an exact callback", async () => {
  api.apiRequest.mockResolvedValueOnce(response({ enabled: false, callbackUrl: null, exchangeUrl: "https://api.example/exchange" }));
  const ui = render();
  try {
    await waitFor(() => expect(ui.container.textContent).toContain("Disabled"));
    expect(ui.container.textContent).toContain("Signup creates a pending transaction, not a login");
    expect(ui.container.textContent).toContain("state valid for 2 minutes");
    expect(ui.container.textContent).toContain("link scanners cannot confirm accounts");
    const input = ui.container.querySelector<HTMLInputElement>("#confirmation-callback-url")!;
    api.apiRequest.mockResolvedValueOnce(response({
      enabled: true,
      callbackUrl: "https://app.example.com/auth/confirmed",
      exchangeUrl: "https://api.example/exchange",
    }));
    fireEvent.change(input, { target: { value: "https://app.example.com/auth/confirmed" } });
    const form = ui.container.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(api.apiRequest).toHaveBeenCalledWith("PATCH", "/cf-auth/v1/admin/tenants/tenant-x/confirmation-flow", {
      callbackUrl: "https://app.example.com/auth/confirmed",
    }));
    await waitFor(() => expect(ui.container.textContent).toContain("Backend confirmation handoff saved and enabled."));
  } finally { ui.close(); }
});

it("reports load errors with a retry action", async () => {
  api.apiRequest.mockRejectedValueOnce(new Error("service unavailable"));
  const ui = render();
  try {
    await waitFor(() => expect(ui.container.textContent).toContain("Couldn't load confirmation flow"));
    expect(ui.container.querySelector("button")?.textContent).toContain("Try again");
    expect(ui.container.textContent).toContain("Download CallbackPage.jsx");
  } finally { ui.close(); }
});

it("rejects a non-local HTTP callback before PATCH", async () => {
  api.apiRequest.mockResolvedValueOnce(response({ enabled: false, callbackUrl: null, exchangeUrl: "/exchange" }));
  const ui = render();
  try {
    await waitFor(() => expect(ui.container.textContent).toContain("Disabled"));
    const input = ui.container.querySelector<HTMLInputElement>("#confirmation-callback-url")!;
    fireEvent.change(input, { target: { value: "http://example.com/confirm" } });
    fireEvent.submit(ui.container.querySelector("form")!);
    expect(ui.container.textContent).toContain("Use HTTPS");
    expect(api.apiRequest).toHaveBeenCalledTimes(1);
  } finally { ui.close(); }
});
