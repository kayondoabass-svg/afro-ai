import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FounderAuthBranding } from "./founder-auth-branding";

const { apiRequest, toast } = vi.hoisted(() => ({ apiRequest: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/queryClient", async (original) => ({
  ...(await original<typeof import("@/lib/queryClient")>()),
  apiRequest,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const record = {
  project: { id: "tenant-other", name: "Eastline Health", slug: "eastline" },
  entitlement: { plan: "builder", source: "override", expiresAt: "2028-03-12T00:00:00.000Z", paymentId: null },
  settings: { senderName: "Eastline", replyTo: "support@eastline.example", verifySubject: "Welcome" },
  domains: [{ id: 11, domain: "eastline.example", status: "verified" }],
  recentMail: [{ purpose: "verify", outcome: "accepted", reason: null, message_id: "mail-17", created_at: 1_700_000_000 }],
  audit: [{ actor_id: "founder-4", action: "branding.saved", metadata: { fields: ["senderName"] }, created_at: 1_700_000_000 }],
};
const response = (body: unknown) => ({ json: async () => body });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FounderAuthBranding projectId="tenant-other" /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("loads the founder-only project record and makes the owner-wide scope explicit", async () => {
  apiRequest.mockResolvedValueOnce(response(record));
  setup();
  expect(await screen.findByText("Eastline Health · Auth branding")).toBeTruthy();
  expect(screen.getByText(/every Afro Auth project owned by the same account/)).toBeTruthy();
  expect(screen.getByText("support@eastline.example")).toBeTruthy();
  expect(apiRequest).toHaveBeenCalledWith("GET", "/api/founder/auth-projects/tenant-other/branding");
});

it("requires an audit reason and explicit confirmation before saving the global override", async () => {
  vi.stubGlobal("confirm", vi.fn(() => true));
  apiRequest
    .mockResolvedValueOnce(response(record))
    .mockResolvedValueOnce(response({ ok: true }))
    .mockResolvedValueOnce(response(record))
    .mockResolvedValueOnce(response({ rows: [], page: 1 }));
  setup();
  await screen.findByText("Eastline Health · Auth branding");
  const save = screen.getByRole("button", { name: "Save owner-wide override" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Required audit reason"), { target: { value: "Approved support entitlement" } });
  fireEvent.click(save);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
    "PATCH",
    "/api/founder/auth-projects/tenant-other/branding-entitlement",
    { plan: "builder", expiresAt: "2028-03-12T23:59:59.000Z", reason: "Approved support entitlement" },
  ));
  expect(window.confirm).toHaveBeenCalled();
});
