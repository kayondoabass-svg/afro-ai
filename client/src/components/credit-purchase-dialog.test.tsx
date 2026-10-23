import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queryClient", () => ({ apiRequest: request }));
import { CreditPurchaseDialog } from "./credit-purchase-dialog";
const url = "https://pay.pesapal.com/checkout?order=test-order";
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(cleanup);
describe("temporary credit checkout", () => {
  it("uses existing one-time checkout without changing the customer's spending limit", async () => {
    request.mockResolvedValue(Response.json({ redirectUrl: url }));
    localStorage.setItem("afro-ai-country", "UG");
    const redirect = vi.fn();
    render(<CreditPurchaseDialog onClose={vi.fn()} onBack={vi.fn()} onCheckout={redirect} />);
    fireEvent.click(screen.getByTestId("button-quota-pack10"));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith(url));
    expect(request).toHaveBeenCalledExactlyOnceWith("POST", "/api/payg/topup", { pack: "pack10", mode: "one-time", countryCode: "UG" });
    expect(screen.getByText(/Low-balance auto-top-up — not enabled/)).toBeVisible();
  });
  it("prevents duplicate checkout submissions and ignores redirects after closing", async () => {
    let resolve!: (response: Response) => void;
    request.mockReturnValue(new Promise<Response>(r => { resolve = r; }));
    const redirect = vi.fn();
    const { unmount } = render(<CreditPurchaseDialog onClose={vi.fn()} onBack={vi.fn()} onCheckout={redirect} />);
    fireEvent.click(screen.getByTestId("button-quota-pack5"));
    fireEvent.click(screen.getByTestId("button-quota-pack10"));
    expect(request).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { resolve(Response.json({ redirectUrl: url })); });
    expect(redirect).not.toHaveBeenCalled();
  });
  it.each([null, "javascript:alert(1)", "https://pay.pesapal.com.evil.test/checkout"])("does not redirect to an invalid checkout: %s", async redirectUrl => {
    request.mockResolvedValue(Response.json({ redirectUrl }));
    const redirect = vi.fn();
    render(<CreditPurchaseDialog onClose={vi.fn()} onBack={vi.fn()} onCheckout={redirect} />);
    fireEvent.click(screen.getByTestId("button-quota-pack5"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No payment has been confirmed here");
    expect(redirect).not.toHaveBeenCalled();
  });
});
