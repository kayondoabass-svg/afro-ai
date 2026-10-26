import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link } from "wouter";
import DomainsPage from "@/pages/domains";

vi.mock("@/components/domain-manager", () => ({ default: () => <div>Domain management view</div> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const mocks = vi.hoisted(() => ({ owned: [] as Array<{ domainName: string; status: string }> }));

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async () => mocks.owned } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Link href="/domains?tab=search">Store navigation</Link>
      <Link href="/domains?tab=mydomains">Management navigation</Link>
      <DomainsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.owned = [];
  window.history.replaceState(null, "", "/domains");
});
afterEach(cleanup);

it("honors explicit search for previous buyers and selects both tabs on same-page navigation", async () => {
  mocks.owned = [{ domainName: "amina.example", status: "active" }];
  window.history.replaceState(null, "", "/domains?tab=search");
  const user = userEvent.setup();
  mount();
  await waitFor(() => expect(screen.getByTestId("tab-search")).toHaveAttribute("data-state", "active"));
  await user.click(screen.getByRole("link", { name: "Management navigation" }));
  expect(screen.getByTestId("tab-mydomains")).toHaveAttribute("data-state", "active");
  await user.click(screen.getByRole("link", { name: "Store navigation" }));
  expect(screen.getByTestId("tab-search")).toHaveAttribute("data-state", "active");
  expect(screen.getByTestId("input-domain-search")).toBeVisible();
});

it("defaults to management for buyers with no explicit valid tab", async () => {
  mocks.owned = [{ domainName: "amina.example", status: "active" }];
  window.history.replaceState(null, "", "/domains?tab=invalid");
  mount();
  await waitFor(() => expect(screen.getByText("Domain management view")).toBeVisible());
});

it("honors management for new buyers and puts tab clicks in the URL", async () => {
  window.history.replaceState(null, "", "/domains?tab=mydomains&ref=campaign");
  const user = userEvent.setup();
  mount();
  expect(screen.getByText("Domain management view")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "Find Domains" }));
  expect(new URLSearchParams(window.location.search).get("tab")).toBe("search");
  expect(new URLSearchParams(window.location.search).get("ref")).toBe("campaign");
});

it("preserves payment-return processing, management default, and unrelated URL parameters", async () => {
  window.history.replaceState(null, "", "/domains?status=success&order=81&ref=campaign");
  mount();
  expect(await screen.findByText("Checkout returned")).toBeVisible();
  expect(screen.getByText("Domain management view")).toBeVisible();
  expect(window.location.search).toContain("tab=mydomains");
  expect(window.location.search).toContain("ref=campaign");
  expect(window.location.search).not.toContain("status=");
  expect(window.location.search).not.toContain("order=");
});

it("preserves an explicit search tab through checkout-return cleanup", async () => {
  window.history.replaceState(null, "", "/domains?status=success&order=81&tab=search");
  mount();
  expect(await screen.findByText("Checkout returned")).toBeVisible();
  expect(screen.getByTestId("tab-search")).toHaveAttribute("data-state", "active");
});

it("updates the tab when browser Back changes only the query string", async () => {
  window.history.replaceState(null, "", "/domains?tab=mydomains");
  mount();
  act(() => {
    window.history.replaceState(null, "", "/domains?tab=search");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => expect(screen.getByTestId("tab-search")).toHaveAttribute("data-state", "active"));
});