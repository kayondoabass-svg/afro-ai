import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ toast: vi.fn(), navigate: vi.fn(), request: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/chat?projectId=1", mocks.navigate] }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.request }));
import { QuotaNotifications } from "./quota-notifications";
function block(overrides = {}) {
  act(() => window.dispatchEvent(new CustomEvent("afroai:quota-blocked", { detail: {
    kind: "chat", used: 100, limit: 100, percent: 100, plan: "starter",
    resetsAt: new Date(Date.now() + 3600_000).toISOString(), ...overrides,
  } })));
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(cleanup);
describe("free daily cap purchase guidance", () => {
  it("shows the requested free-cap message and opens a temporary purchase screen", () => {
    render(<QuotaNotifications />);
    block();
    expect(screen.getByText("You've used up your free daily cap")).toBeVisible();
    expect(screen.getByText(/Purchase credits to continue using Afro AI/)).toBeVisible();
    expect(screen.getByText(/at midnight UTC/)).toBeVisible();
    fireEvent.click(screen.getByTestId("button-quota-buy-credits"));
    expect(screen.getByTestId("dialog-credit-purchase")).toBeVisible();
    expect(screen.getAllByTestId(/button-quota-pack/)).toHaveLength(4);
    expect(screen.getByText("No subscription or repeat charges are authorized.")).toBeVisible();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("dialog-quota-blocked")).toBeVisible();
  });
  it("lets the customer wait for the free reset without purchasing or changing their project", () => {
    render(<QuotaNotifications />);
    block();
    fireEvent.click(screen.getByTestId("button-quota-dismiss"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("preserves the existing paid-plan purchase navigation", () => {
    render(<QuotaNotifications />);
    block({ plan: "pro", limit: 1000, used: 1000 });
    expect(screen.getByText("Daily limit reached")).toBeVisible();
    expect(screen.queryByText("You've used up your free daily cap")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-quota-buy-credits"));
    expect(mocks.navigate).toHaveBeenCalledWith("/pricing#payg");
  });
  it("does not describe excluded video as an exhausted free allowance", () => {
    render(<QuotaNotifications />);
    block({ kind: "video", used: 0, limit: 0 });
    expect(screen.getByText("Video isn't included in your plan")).toBeVisible();
    expect(screen.queryByTestId("button-quota-buy-credits")).not.toBeInTheDocument();
    expect(screen.queryByText(/Wait until reset/)).not.toBeInTheDocument();
  });
});
