import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DomainManager, { type DomainManagerDetails, type ManagedDomain } from "./domain-manager";
import DomainsPage from "@/pages/domains";

const mocks = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { apiRequest: mocks.request, queryClient: new QueryClient() };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

const external: ManagedDomain = {
  id: "external:9c202e", source: "external", domainName: "studio.example",
  status: "unverified", expiresAt: null, verifiedAt: null, pricePaid: null, registrar: "Independent registrar",
};
const owned: ManagedDomain = {
  id: "afro:27", source: "afro", domainName: "atelier.example", status: "active",
  expiresAt: "2027-08-12T10:00:00Z", verifiedAt: null, pricePaid: 1754, registrar: "Name.com",
};
function details(domain: ManagedDomain): DomainManagerDetails {
  const isOwned = domain.source === "afro";
  return {
    domain,
    details: { nameservers: isOwned ? ["ns1.provider.example", "ns2.provider.example"] : [],
      locked: isOwned ? true : null, privacyEnabled: isOwned ? false : null,
      autoRenewEnabled: null, createDate: isOwned ? "2026-08-12T10:00:00Z" : null, expireDate: domain.expiresAt },
    dns: { records: isOwned ? [{ id: 31, hostname: "www", type: "A", answer: "192.0.2.17", ttl: 1800 }] :
      [{ hostname: "@", type: "TXT", answer: "public-record", ttl: 300 }], errors: [] },
    verification: isOwned ? null : { name: "_afro-verify.studio.example", value: "afro-verification-token" },
    registrarAvailable: isOwned,
    capabilities: { nameservers: isOwned, dns: isOwned },
    website: isOwned ? { appId: 42, appName: "Atelier", verified: false, dnsTarget: "atelier.host.example" } : null,
  };
}
let client: QueryClient;
let domains: ManagedDomain[];
let selectedDetails: DomainManagerDetails | undefined;
let publishedApps: { id: number; title: string; subdomain: string; customDomain: string | null; customDomainVerified: boolean }[];
let websiteVerification: { verified: boolean; message: string };
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/domains");
  domains = [];
  selectedDetails = undefined;
  publishedApps = [];
  websiteVerification = { verified: false, message: "No CNAME record found yet." };
  client = new QueryClient({ defaultOptions: { queries: { retry: false,
    queryFn: async ({ queryKey }) => (await mocks.request("GET", queryKey.join("/"))).json(),
  }, mutations: { retry: false } } });
  mocks.request.mockImplementation(async (method: string, path: string, body?: { domain?: string }) => ({
    json: async () => {
      if (method === "GET" && path === "/api/domain-manager") return { domains };
      if (method === "GET" && path === "/api/domains/my") return [];
      if (method === "GET" && path === "/api/published-apps") return publishedApps;
      if (method === "GET") return selectedDetails ?? details(domains.find(d => path.endsWith(encodeURIComponent(d.id)))!);
      if (path.endsWith("/connect-domain")) return { success: true, domain: body?.domain, message: "Domain saved." };
      if (path.endsWith("/verify-domain")) return websiteVerification;
      if (path.includes("/domains/activate/")) {
        domains = domains.map(d => d.source === "afro" ? { ...d, status: "active" } : d);
        return { success: true, order: { status: "active" } };
      }
      if (path.endsWith("/verify")) return { verified: true, message: "TXT ownership confirmed." };
      return {};
    },
  }));
});
afterEach(() => { cleanup(); client.clear(); });
function mount() {
  return render(<QueryClientProvider client={client}><DomainManager /></QueryClientProvider>);
}
async function confirm() {
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

it("adds external tracking through the API and refreshes the list", async () => {
  mount();
  await screen.findByText("No domains tracked yet");
  fireEvent.click(screen.getByRole("button", { name: "Add external domain" }));
  expect(screen.getByText(/Tracking does not transfer your domain/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Domain name"), { target: { value: "Studio.Example" } });
  fireEvent.change(screen.getByLabelText("Registrar (optional)"), { target: { value: external.registrar } });
  domains = [external];
  fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
  await screen.findByRole("button", { name: /studio.example/ });
  expect(mocks.request).toHaveBeenCalledWith("POST", "/api/domain-manager/external", {
    domainName: "studio.example", registrar: external.registrar,
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("copies the exact TXT record and verifies external ownership", async () => {
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  domains = [external];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Copy TXT value" }));
  await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith("afro-verification-token"));
  fireEvent.click(screen.getByRole("button", { name: "Copy TXT name" }));
  await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith("_afro-verify.studio.example"));
  selectedDetails = details({ ...external, verifiedAt: "2026-09-01T14:23:00Z", status: "verified" });
  fireEvent.click(screen.getByRole("button", { name: "Verify ownership" }));
  await screen.findByText("TXT ownership confirmed.");
  expect(mocks.request).toHaveBeenCalledWith("POST", "/api/domain-manager/external%3A9c202e/verify", undefined);
  await waitFor(() => expect(screen.queryByText("Not verified")).toBeNull());
});

it("does not fabricate success when verification cannot find the TXT record", async () => {
  domains = [external];
  mocks.request.mockImplementation(async (method: string, path: string) => ({ json: async () =>
    method === "POST" ? { verified: false, message: "TXT record not found yet." } :
    path === "/api/domain-manager" ? { domains } : details(external) }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Verify ownership" }));
  await screen.findByText("TXT record not found yet.");
  expect(screen.getByText("Not verified")).toBeTruthy();
});

it("requires confirmation to remove tracking, not the external domain itself", async () => {
  domains = [external];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Remove tracking" }));
  expect(screen.getByText(/It does not delete the domain, cancel registration, or change DNS/)).toBeTruthy();
  expect(mocks.request.mock.calls.some(([method]) => method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove tracking" }));
  domains = [];
  await confirm();
  await screen.findByText("No domains tracked yet");
  expect(mocks.request).toHaveBeenCalledWith("DELETE", "/api/domain-manager/external%3A9c202e", undefined);
});

it("renders unavailable external data and read-only public DNS, with no provider controls", async () => {
  domains = [external];
  mount();
  await screen.findByText("public-record");
  expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(3);
  expect(screen.getByText(/Public DNS is read-only/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add DNS record" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Change nameservers" })).toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.getByRole("link", { name: "Request renewal" }).getAttribute("href")).toBe("/contact");
  expect(screen.getByRole("link", { name: "Request transfer" }).getAttribute("href")).toBe("/contact");
  expect(screen.getByText(/Assisted support requests, not automated checkout/)).toBeTruthy();
});

it("shows real owned-domain metadata and the actual website target", async () => {
  domains = [owned];
  mount();
  await screen.findByText("$17.54");
  expect(screen.getByText("Locked")).toBeTruthy();
  expect(screen.getByText("Disabled")).toBeTruthy();
  expect(screen.getByText("atelier.host.example")).toBeTruthy();
  expect(screen.getByText("Atelier")).toBeTruthy();
  expect(screen.getAllByText("Not verified")).toHaveLength(2);
  expect((await screen.findByRole("link", { name: "Build and publish an app" })).getAttribute("href")).toBe("/chat");
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.queryByRole("link", { name: /name.com/i })).toBeNull();
});

it("creates and edits DNS records with numeric API payloads", async () => {
  domains = [owned];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Add DNS record" }));
  fireEvent.change(screen.getByLabelText("Type"), { target: { value: "MX" } });
  fireEvent.change(screen.getByLabelText("Hostname (blank for root)"), { target: { value: "@" } });
  fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "mail.atelier.example" } });
  fireEvent.change(screen.getByLabelText("TTL (seconds)"), { target: { value: "900" } });
  fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Save record" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.request).toHaveBeenCalledWith("POST", "/api/domain-manager/afro%3A27/dns",
    { hostname: "@", type: "MX", answer: "mail.atelier.example", ttl: 900, priority: 10 });
  fireEvent.click(screen.getByRole("button", { name: "Edit A www" }));
  expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("192.0.2.17");
  fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "192.0.2.28" } });
  fireEvent.click(screen.getByRole("button", { name: "Save record" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.request).toHaveBeenCalledWith("PUT", "/api/domain-manager/afro%3A27/dns/31",
    { hostname: "www", type: "A", answer: "192.0.2.28", ttl: 1800 });
  expect(mocks.request.mock.calls.filter(([method, path]) => method === "GET" && path.endsWith("afro%3A27")).length).toBeGreaterThan(2);
});

it("confirms disruptive record deletion and nameserver replacement before mutation", async () => {
  domains = [owned];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Delete A www" }));
  expect(screen.getByText(/This can interrupt your website, email/)).toBeTruthy();
  await confirm();
  expect(mocks.request).toHaveBeenCalledWith("DELETE", "/api/domain-manager/afro%3A27/dns/31", undefined);
  fireEvent.click(screen.getByRole("button", { name: "Change nameservers" }));
  expect(screen.getByText(/can cause website and email downtime/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Nameservers \(one per line/), { target: { value: "ns1.new.example,\nns2.new.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Review change" }));
  expect(screen.getByText(/may cause website and email downtime/)).toBeTruthy();
  expect(mocks.request.mock.calls.some(([method]) => method === "PUT")).toBe(false);
  await confirm();
  expect(mocks.request).toHaveBeenCalledWith("PUT", "/api/domain-manager/afro%3A27/nameservers",
    { nameservers: ["ns1.new.example", "ns2.new.example"] });
});

it("honors capabilities and shows a provider outage without fake details", async () => {
  domains = [owned];
  selectedDetails = { ...details(owned), registrarAvailable: false, message: "Provider temporarily unreachable.",
    capabilities: { nameservers: false, dns: false }, dns: { records: [], errors: ["Public DNS lookup failed."] } };
  mount();
  await screen.findByText("Provider temporarily unreachable.");
  expect(screen.getByText("Public DNS lookup failed.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add DNS record" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Change nameservers" })).toBeNull();
});

it("shows skeletons, a retryable load error and a working retry", async () => {
  mocks.request.mockRejectedValueOnce(new Error("Manager temporarily unavailable."));
  mount();
  expect(screen.getByLabelText("Loading domains")).toBeTruthy();
  await screen.findByText("Manager temporarily unavailable.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No domains tracked yet");
});

it("preserves DNS form edits after failed mutations and allows retry", async () => {
  domains = [owned];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Edit A www" }));
  fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "192.0.2.99" } });
  mocks.request.mockRejectedValueOnce(new Error("Provider rejected this change."));
  fireEvent.click(screen.getByRole("button", { name: "Save record" }));
  await screen.findByText("Provider rejected this change.");
  expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("192.0.2.99");
  fireEvent.click(screen.getByRole("button", { name: "Save record" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("preserves an external add form on API error and allows retry", async () => {
  mount();
  await screen.findByText("No domains tracked yet");
  fireEvent.click(screen.getByRole("button", { name: "Add external domain" }));
  fireEvent.change(screen.getByLabelText("Domain name"), { target: { value: "studio.example" } });
  mocks.request.mockRejectedValueOnce(new Error("Domain already tracked."));
  fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
  await screen.findByText("Domain already tracked.");
  expect((screen.getByLabelText("Domain name") as HTMLInputElement).value).toBe("studio.example");
  domains = [external];
  fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
  await screen.findByRole("button", { name: "Verify ownership" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("switches selection and scopes details to the selected domain", async () => {
  domains = [owned, external];
  mount();
  await screen.findByText("$17.54");
  fireEvent.click(screen.getByRole("button", { name: /studio.example/ }));
  await screen.findByRole("button", { name: "Verify ownership" });
  expect(screen.queryByText("$17.54")).toBeNull();
  expect(screen.getByRole("button", { name: /studio.example/ }).getAttribute("aria-pressed")).toBe("true");
});

it("shows a retryable detail error and blocks nameservers for non-active registrations", async () => {
  domains = [{ ...owned, status: "pending_payment" }];
  mocks.request.mockImplementation(async (_method: string, path: string) => {
    if (path !== "/api/domain-manager") throw new Error("Detail service unavailable.");
    return { json: async () => ({ domains }) };
  });
  mount();
  await screen.findByText("Detail service unavailable.");
  mocks.request.mockResolvedValue({ json: async () => details(domains[0]) });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("$17.54");
  expect(screen.queryByRole("button", { name: "Change nameservers" })).toBeNull();
});

it("integrates My Domains without automatic activation even after checkout returns", async () => {
  window.history.replaceState({}, "", "/domains?status=success&order=27");
  domains = [{ ...owned, status: "pending_payment" }];
  render(<QueryClientProvider client={client}><DomainsPage /></QueryClientProvider>);
  await screen.findByText("Checkout returned");
  fireEvent.mouseDown(screen.getByTestId("tab-mydomains"), { button: 0, ctrlKey: false });
  await screen.findByText("Your domains. One workspace.");
  expect(screen.queryByRole("button", { name: /activate/i })).toBeNull();
  expect(mocks.request.mock.calls.some(([, path]) => path.includes("/activate"))).toBe(false);
});

it("completes paid registration only after an explicit click and refreshes the domain", async () => {
  domains = [{ ...owned, status: "pending_payment" }];
  mount();
  const complete = await screen.findByRole("button", { name: "Complete paid registration" });
  expect(mocks.request.mock.calls.some(([, path]) => path.includes("/activate"))).toBe(false);
  fireEvent.click(complete);
  await screen.findByText("Registration completed. You can now connect your published app.");
  expect(mocks.request).toHaveBeenCalledWith("POST", "/api/domains/activate/27", {});
  await waitFor(() => expect(screen.queryByRole("button", { name: "Complete paid registration" })).toBeNull());
  expect(screen.getAllByText("active").length).toBeGreaterThan(0);
});

it("shows secured activation errors without asserting payment or registration success", async () => {
  domains = [{ ...owned, status: "pending_payment" }];
  mount();
  const complete = await screen.findByRole("button", { name: "Complete paid registration" });
  mocks.request.mockRejectedValueOnce(new Error("Payment has not completed."));
  fireEvent.click(complete);
  await screen.findByText("Payment has not completed.");
  expect(screen.queryByText(/Registration completed\./)).toBeNull();
  expect(screen.getByRole("button", { name: "Complete paid registration" })).toBeTruthy();
});

it("offers support instead of payment or registration retries during review", async () => {
  domains = [{ ...owned, status: "registration_review" }];
  mount();
  await screen.findByText(/Registration needs support review/);
  expect(screen.getByRole("link", { name: "Contact registration support" }).getAttribute("href")).toBe("/contact");
  expect(screen.queryByRole("button", { name: "Complete paid registration" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save website connection" })).toBeNull();
});

it("shows registration in progress without a retry button", async () => {
  domains = [{ ...owned, status: "registering" }];
  mount();
  await screen.findByText(/Registration is in progress. Do not retry payment/);
  expect(screen.getAllByText("Registration in progress")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Complete paid registration" })).toBeNull();
});

it("selects an actual app, saves www and exposes verification immediately", async () => {
  domains = [owned];
  publishedApps = [
    { id: 51, title: "Lookbook", subdomain: "lookbook", customDomain: null, customDomainVerified: false },
    { id: 62, title: "Workshop bookings", subdomain: "workshop", customDomain: null, customDomainVerified: false },
  ];
  mount();
  fireEvent.change(await screen.findByLabelText("Published app"), { target: { value: "62" } });
  fireEvent.click(screen.getByRole("button", { name: "Save website connection" }));
  await screen.findByRole("button", { name: "Verify website connection" });
  expect(mocks.request).toHaveBeenCalledWith("POST", "/api/published-apps/62/connect-domain", { domain: "www.atelier.example" });
  expect(screen.getAllByText("www.atelier.example").length).toBeGreaterThan(0);
  expect(screen.getByText("Website DNS not verified")).toBeTruthy();
  expect(screen.getByText(/CNAME → afroaigroup.com/)).toBeTruthy();
  expect(screen.getByText(/ALIAS\/ANAME or CNAME flattening/)).toBeTruthy();
  // Parent lookup still reports only the exact apex; the saved www app remains selected.
  await waitFor(() => expect((screen.getByLabelText("Published app") as HTMLSelectElement).value).toBe("62"));
  fireEvent.click(screen.getByRole("button", { name: "Verify website connection" }));
  await screen.findByText("No CNAME record found yet.");
  expect(screen.queryByText("Website domain verified by the server.")).toBeNull();
  expect(mocks.request).toHaveBeenCalledWith("POST", "/api/published-apps/62/verify-domain", {});
  websiteVerification = { verified: true, message: "Verified successfully." };
  fireEvent.click(screen.getByRole("button", { name: "Verify website connection" }));
  await screen.findByText("Website domain verified by the server.");
  expect(screen.getByText("Website DNS verified by server")).toBeTruthy();
});

it("requires explicit confirmation before replacing an app's existing custom domain", async () => {
  domains = [owned];
  publishedApps = [{ id: 51, title: "Lookbook", subdomain: "lookbook", customDomain: "previous.example", customDomainVerified: true }];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Save website connection" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText(/Visitors using the old hostname may lose access/)).toBeTruthy();
  expect(mocks.request.mock.calls.some(([, path]) => path.endsWith("/connect-domain"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save website connection" }));
  fireEvent.click(screen.getByRole("button", { name: "Replace connection" }));
  await screen.findByRole("button", { name: "Verify website connection" });
  expect(mocks.request).toHaveBeenCalledWith("POST", "/api/published-apps/51/connect-domain", { domain: "www.atelier.example" });
  expect(screen.getByText("Website DNS not verified")).toBeTruthy();
});

it("connects only verified external domains and keeps management at their DNS provider", async () => {
  domains = [external];
  publishedApps = [{ id: 51, title: "Lookbook", subdomain: "lookbook", customDomain: null, customDomainVerified: false }];
  const view = mount();
  await screen.findByText(/Verify domain ownership above before connecting/);
  expect(screen.queryByRole("button", { name: "Save website connection" })).toBeNull();
  expect(mocks.request.mock.calls.some(([, path]) => path === "/api/published-apps")).toBe(false);
  view.unmount();
  client.clear();
  domains = [{ ...external, status: "verified", verifiedAt: "2026-09-01T14:23:00Z" }];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Save website connection" }));
  await screen.findByRole("button", { name: "Verify website connection" });
  expect(mocks.request).toHaveBeenCalledWith("POST", "/api/published-apps/51/connect-domain", { domain: "www.studio.example" });
  expect(screen.getByText(/In your registrar or DNS provider settings/)).toBeTruthy();
});

it("offers an exact apex choice without fabricating A records and shows connect errors", async () => {
  domains = [owned];
  publishedApps = [{ id: 51, title: "Lookbook", subdomain: "lookbook", customDomain: null, customDomainVerified: false }];
  mount();
  fireEvent.change(await screen.findByLabelText("Website hostname"), { target: { value: "exact" } });
  mocks.request.mockRejectedValueOnce(new Error("This domain is already connected to another app."));
  fireEvent.click(screen.getByRole("button", { name: "Save website connection" }));
  await screen.findByText("This domain is already connected to another app.");
  expect(screen.queryByRole("button", { name: "Verify website connection" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save website connection" }));
  await screen.findByRole("button", { name: "Verify website connection" });
  expect(mocks.request).toHaveBeenCalledWith("POST", "/api/published-apps/51/connect-domain", { domain: "atelier.example" });
  expect(screen.getByText(/Do not invent an A-record IP address/)).toBeTruthy();
});

it("shows a recoverable published-app loading error instead of a generic navigation link", async () => {
  domains = [owned];
  mocks.request.mockImplementation(async (_method: string, path: string) => {
    if (path === "/api/published-apps") throw new Error("Published apps temporarily unavailable.");
    return { json: async () => path === "/api/domain-manager" ? { domains } : details(owned) };
  });
  mount();
  await screen.findByText("Published apps temporarily unavailable.");
  mocks.request.mockResolvedValue({ json: async () => [] });
  fireEvent.click(screen.getByRole("button", { name: "Retry published apps" }));
  await screen.findByRole("link", { name: "Build and publish an app" });
});

it("refreshes a failed registration into review and does not offer another registration attempt", async () => {
  domains = [{ ...owned, status: "pending_payment" }];
  mount();
  const button = await screen.findByRole("button", { name: "Complete paid registration" });
  mocks.request.mockImplementationOnce(async () => {
    domains = [{ ...owned, status: "registration_review" }];
    throw new Error("Registrar outcome needs review. Contact support.");
  });
  fireEvent.click(button);
  await screen.findByText(/Registration needs support review/);
  expect(screen.queryByRole("button", { name: "Complete paid registration" })).toBeNull();
});