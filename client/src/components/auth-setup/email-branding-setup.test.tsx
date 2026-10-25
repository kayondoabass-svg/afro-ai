import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmailBrandingSetup } from "./email-branding-setup";

const { apiRequest, openPaymentCheckout, toast } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  openPaymentCheckout: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/queryClient", async (original) => ({
  ...(await original<typeof import("@/lib/queryClient")>()),
  apiRequest,
}));
vi.mock("@/components/payment-checkout", () => ({ openPaymentCheckout }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const settings = {
  logoUrl: "", color: "#9A4F36", senderName: "Mango Market", replyTo: "help@mango.example", domainId: 8,
  fromAddress: "hello@mango.example", verifySubject: "Confirm your account", verifyIntro: "Welcome to Mango Market.",
  resetSubject: "Reset your password", resetIntro: "Choose a new password.", footer: "Mango Market support",
  verifyHtml: "<p>Confirm</p>", resetHtml: "<p>Reset</p>",
};
const branding = {
  project: { id: "project-7", name: "Mango Market", slug: "mango-market" },
  package: { key: "starter", name: "Starter", usd: 0, mau: 5000, apps: 1 },
  source: "free",
  expiresAt: null,
  features: { identity: false, senderDomain: false, copy: false, whiteLabel: false, html: false },
  settings,
  domains: [{ id: 8, domain: "mango.example", status: "verified" }, { id: 9, domain: "pending.example", status: "pending" }],
  packages: [
    { key: "builder", name: "Builder", usd: 5, mau: 25000, apps: 1 },
    { key: "business", name: "Business", usd: 25, mau: 100000, apps: 5 },
  ],
  retainedLockedFields: ["senderName", "verifySubject", "verifyHtml"],
  recentMail: [],
  testRecipient: "owner@example.com",
};

function respond(body: unknown) {
  return { json: async () => body };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><EmailBrandingSetup projectId="project-7" /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EmailBrandingSetup", () => {
  it("loads project settings and presents locked fields as disabled with upgrade guidance", async () => {
    apiRequest.mockResolvedValueOnce(respond(branding));
    setup();
    expect(await screen.findByText("Mango Market email identity")).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith("GET", "/api/auth-projects/project-7/branding");
    expect((screen.getByLabelText(/Sender name/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/3 locked fields are preserved/)).toBeTruthy();
    expect(screen.getByText("mango.example · verified")).toBeTruthy();
    expect(screen.queryByText("pending.example · verified")).toBeNull();
  });

  it("submits the full saved settings object without dropping locked values", async () => {
    apiRequest.mockResolvedValueOnce(respond(branding)).mockResolvedValueOnce(respond({ ok: true, settings }));
    setup();
    await screen.findByText("Mango Market email identity");
    fireEvent.click(screen.getByRole("button", { name: "Save branding" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/auth-projects/project-7/branding",
      settings,
    ));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Email branding saved" }));
  });

  it("reports save failures and leaves the existing values intact", async () => {
    apiRequest.mockResolvedValueOnce(respond(branding)).mockRejectedValueOnce(new Error("400: invalid sender"));
    setup();
    await screen.findByText("Mango Market email identity");
    fireEvent.click(screen.getByRole("button", { name: "Save branding" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't save email branding",
      variant: "destructive",
    })));
    expect((screen.getByLabelText(/Sender name/) as HTMLInputElement).value).toBe("Mango Market");
  });

  it("previews current edits in a sandboxed frame and tests only the saved template", async () => {
    apiRequest.mockResolvedValueOnce(respond(branding))
      .mockResolvedValueOnce(respond({ subject: "Preview only", html: "<p>Safe</p>", text: "Safe", from: "Mango <hello@mango.example>", replyTo: "help@mango.example" }))
      .mockResolvedValueOnce(respond({ accepted: true, messageId: "queued-44" }));
    setup();
    await screen.findByText("Mango Market email identity");
    fireEvent.click(screen.getByRole("button", { name: "Preview current edits" }));
    const frame = await screen.findByTitle("Verification email preview");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect((frame as HTMLIFrameElement).srcdoc).toBe("<p>Safe</p>");
    fireEvent.click(screen.getByRole("button", { name: "Send saved verification test" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "POST",
      "/api/auth-projects/project-7/branding/test",
      { purpose: "verify" },
    ));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Test accepted",
      description: expect.stringContaining("Acceptance is not delivery confirmation."),
    }));
  });

  it("starts secure checkout with the selected owned project and plan, without claiming payment", async () => {
    apiRequest.mockResolvedValueOnce(respond(branding)).mockResolvedValueOnce(respond({
      paymentId: 83, redirectUrl: "https://pay.example/checkout", plan: "auth-builder",
    }));
    setup();
    await screen.findByText("Mango Market email identity");
    fireEvent.click(screen.getByRole("button", { name: "Select Builder" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("POST", "/api/subscribe", {
      plan: "auth-builder", projectId: "project-7", countryCode: undefined, embedded: true,
    }));
    expect(openPaymentCheckout).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 83 }));
    expect(screen.getByText(/prepaid access lasts 30 days/i)).toBeTruthy();
  });

  it("shows a retry action when branding cannot be loaded", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Owner access required"));
    setup();
    expect(await screen.findByText("Couldn't load email branding")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });
});
