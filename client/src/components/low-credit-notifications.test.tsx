import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ user: null as any, toast: vi.fn(), navigate: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/dashboard", mocks.navigate] }));
import { LowCreditNotifications } from "./low-credit-notifications";
let client: QueryClient, fetchMock: ReturnType<typeof vi.fn>;
function mount() {
  return render(<QueryClientProvider client={client}><LowCreditNotifications /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); sessionStorage.clear();
  mocks.user = { id: "paid-owner", plan: "payg" };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn(async () => Response.json({ lowCredit: {
    id: 10, balance: { label: "UGX 18,500", approximate: true }, topUpUrl: "/pricing",
  } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
describe("low credit reminders", () => {
  it("shows a local-currency reminder and provides a working top-up action", async () => {
    localStorage.setItem("afro-ai-country", "UG");
    mount();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/payg/status?currency=UGX", expect.objectContaining({ credentials: "include", cache: "no-store" }));
    const notice = mocks.toast.mock.calls[0][0];
    expect(notice.description).toContain("Approximately UGX 18,500");
    expect(notice.description).toContain("US$5");
    const action = render(notice.action);
    fireEvent.click(action.getByTestId("button-low-credit-topup"));
    expect(mocks.navigate).toHaveBeenCalledWith("/pricing");
  });
  it("uses the account currency when no country preference exists and deduplicates the same episode", async () => {
    const first = mount();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/payg/status");
    first.unmount();
    mount();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });
  it.each([null, { id: "free", plan: "starter" }])("does not poll or nag free/anonymous users: %s", user => {
    mocks.user = user;
    mount();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("does not fabricate a warning when the server reports no low balance", async () => {
    fetchMock.mockResolvedValue(Response.json({ lowCredit: null }));
    mount();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
