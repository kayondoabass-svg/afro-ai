import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), request: vi.fn(), toast: vi.fn(), user: { isFounder: true } }));
vi.mock("wouter", () => ({ useLocation: () => ["/templates", mocks.navigate], useSearch: () => window.location.search.slice(1) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user, isLoading: false }) }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient(), apiRequest: mocks.request };
});
import Integrations from "./api-integrations";
import Templates from "./templates";
import Domains from "./domains";
import Checkout from "./domains-checkout";
import Founder from "./founder-dashboard";
let client: QueryClient;
function mount(page: ReactElement) {
  return render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
  client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) =>
    queryKey[0] === "/api/admin/stats" ? { recentDomainOrders: [{ id: 1, domainName: "example.com", pricePaid: 1754, createdAt: "2026-10-01", status: "pending_payment" }] } : [] } } });
});
afterEach(() => { cleanup(); client.clear(); });
it("loads API integrations and opens the add dialog", async () => {
  mocks.request.mockResolvedValue({ json: async () => [] });
  mount(<Integrations />);
  await screen.findByText("No integrations yet");
  fireEvent.click(screen.getByTestId("button-add-integration"));
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("shows a recoverable error rather than crashing on a non-array response", async () => {
  mocks.request.mockResolvedValueOnce({ json: async () => ({ message: "Unavailable" }) })
    .mockResolvedValue({ json: async () => [] });
  mount(<Integrations />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No integrations yet");
});
it("rejects invalid integration records without crashing", async () => {
  mocks.request.mockResolvedValue({ json: async () => [null] });
  mount(<Integrations />);
  await screen.findByText("Could not load integrations");
});
it("previews the real brief without navigating and preserves the use-template action", () => {
  mount(<Templates />);
  fireEvent.click(screen.getAllByRole("button", { name: "View Template" })[0]);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/Build a restaurant website:/)).toBeTruthy();
  expect(mocks.navigate).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Use Template" }));
  expect(mocks.navigate).toHaveBeenCalledWith(expect.stringContaining("/chat?project=Restaurant"));
});
it("leaves domain contact location and phone blank", async () => {
  mocks.request.mockResolvedValue({ json: async () => [{ domainName: "example.com", available: true, purchasable: true, purchasePrice: 17.54, currency: "USD" }] });
  mount(<Domains />);
  fireEvent.change(screen.getByTestId("input-domain-search"), { target: { value: "example.com" } });
  fireEvent.click(screen.getByTestId("button-search-domains"));
  fireEvent.click(await screen.findByTestId("button-register-example.com"));
  for (const field of ["phone", "city", "state", "zip", "country"]) {
    expect((screen.getByTestId(`input-contact-${field}`) as HTMLInputElement).value).toBe("");
  }
});
it("starts the separate checkout with no country or phone selected", () => {
  window.history.replaceState({}, "", "/domain-names/checkout?domain=example.com&price=17.54");
  mount(<Checkout />);
  expect((screen.getByTestId("select-country") as HTMLSelectElement).value).toBe("");
  expect((screen.getByTestId("input-phone") as HTMLInputElement).value).toBe("");
});
it("shows founder order names and converts cents to dollars", async () => {
  mount(<Founder />);
  await waitFor(() => expect(screen.getByTestId("admin-domain-1")).toBeTruthy());
  const order = screen.getByTestId("admin-domain-1");
  expect(within(order).getByText("example.com")).toBeTruthy();
  expect(within(order).getByText(/\$17\.54/)).toBeTruthy();
  expect(within(order).getByText("Pending payment")).toBeTruthy();
});