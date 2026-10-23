import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const authMock = vi.hoisted(() => ({ user: { id: 27 } }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: authMock.user, isLoading: false }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/dashboard", vi.fn()],
}));

import { openPaymentCheckout, PaymentCheckoutHost, reopenPendingPaymentCheckout } from "./payment-checkout";

const payment = {
  id: 143,
  status: "pending",
  amount: "15.00",
  currency: "USD",
  plan: "pro",
  credits: null,
};

function renderHost() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PaymentCheckoutHost /></QueryClientProvider>);
}

beforeEach(() => {
  sessionStorage.clear();
  authMock.user = { id: 27 };
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("embedded payment checkout", () => {
  it("waits for authenticated status verification before showing fulfilled", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(payment))
      .mockResolvedValueOnce(Response.json({ ...payment, status: "completed", credits: 500 }));
    renderHost();
    act(() => openPaymentCheckout({
      paymentId: 143,
      redirectUrl: "https://pay.pesapal.com/checkout?order=hidden",
      amount: "15.00",
      currency: "USD",
      plan: "pro",
    }));
    expect(await screen.findByTitle("Pesapal secure payment form for Afro AI")).toBeInTheDocument();
    expect(screen.getByText("Approve your payment")).toBeInTheDocument();
    expect(screen.queryByText("Payment verified")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Payment verified", level: 2 }, { timeout: 8_000 })).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/payments/143/status", expect.objectContaining({ credentials: "include" }));
  });

  it("rejects foreign checkout hosts explicitly and does not embed them", async () => {
    renderHost();
    act(() => openPaymentCheckout({
      paymentId: 144,
      redirectUrl: "https://pay.pesapal.com.attacker.example/form",
    }));
    expect(await screen.findByText(/could not be validated/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Pesapal secure payment form for Afro AI")).not.toBeInTheDocument();
  });

  it("clears a checkout that the authenticated status endpoint does not own", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not found", { status: 404 }));
    renderHost();
    act(() => openPaymentCheckout({
      paymentId: 145,
      redirectUrl: "https://pay.pesapal.com/checkout",
    }));
    expect(await screen.findByText(/not available for this account/i)).toBeInTheDocument();
    expect(sessionStorage.getItem("afro_ai_pending_payment")).toBeNull();
  });

  it("labels closing as non-cancellation and close only dismisses the modal", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(payment));
    renderHost();
    act(() => openPaymentCheckout({
      paymentId: 146,
      redirectUrl: "https://pay.pesapal.com/checkout",
    }));
    expect(await screen.findByText(/Closing this window does not cancel a payment in progress/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close checkout" })[1]);
    await waitFor(() => expect(screen.queryByTestId("payment-checkout-dialog")).not.toBeInTheDocument());
    expect(sessionStorage.getItem("afro_ai_pending_payment")).not.toBeNull();
  });

  it("aborts closed status checks, ignores late responses, and can reopen the saved iframe", async () => {
    let resolveFirst!: (response: Response) => void;
    let firstSignal: AbortSignal | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      firstSignal = init?.signal as AbortSignal;
      return new Promise(resolve => { resolveFirst = resolve; });
    });
    renderHost();
    act(() => openPaymentCheckout({ paymentId: 150, redirectUrl: "https://pay.pesapal.com/checkout" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const closeButtons = await screen.findAllByRole("button", { name: "Close checkout" });
    fireEvent.click(closeButtons[1]);
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    await act(async () => { resolveFirst(Response.json({ ...payment, id: 150, status: "completed" })); });
    expect(screen.queryByTestId("payment-checkout-dialog")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("afro_ai_pending_payment")).toContain("https://pay.pesapal.com/checkout");

    fetchMock.mockImplementation(async () => Response.json({ ...payment, id: 150 }));
    act(() => reopenPendingPaymentCheckout());
    expect(await screen.findByTitle("Pesapal secure payment form for Afro AI")).toBeInTheDocument();
  });

  it("does not expose a restored provider URL until authenticated status confirms it", async () => {
    sessionStorage.setItem("afro_ai_pending_payment", JSON.stringify({
      paymentId: 151,
      accountId: "27",
      returnTo: "/dashboard",
      providerUrl: "https://pay.pesapal.com/checkout?order=saved",
    }));
    let resolveStatus!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => { resolveStatus = resolve; }));
    renderHost();
    await waitFor(() => expect(resolveStatus).toBeDefined());
    expect(screen.queryByTitle("Pesapal secure payment form for Afro AI")).not.toBeInTheDocument();
    await act(async () => { resolveStatus(Response.json({ ...payment, id: 151 })); });
    expect(await screen.findByTitle("Pesapal secure payment form for Afro AI")).toBeInTheDocument();
    const iframe = screen.getByTitle("Pesapal secure payment form for Afro AI");
    expect(iframe).toHaveAttribute("allow", "payment https://pay.pesapal.com");
    expect(iframe.getAttribute("allow")).not.toMatch(/\*|clipboard/);
  });

  it("keeps old status-only records usable with guidance but does not invent an iframe URL", async () => {
    sessionStorage.setItem("afro_ai_pending_payment", JSON.stringify({
      paymentId: 152,
      accountId: "27",
      returnTo: "/dashboard",
    }));
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ ...payment, id: 152 }));
    renderHost();
    expect(await screen.findByText(/predates secure iframe recovery/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Pesapal secure payment form for Afro AI")).not.toBeInTheDocument();
  });

  it("aborts and clears account-scoped checkout state when the signed-in account changes", async () => {
    let resolveStatus!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise(resolve => { resolveStatus = resolve; });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><PaymentCheckoutHost /></QueryClientProvider>);
    act(() => openPaymentCheckout({ paymentId: 153, redirectUrl: "https://pay.pesapal.com/checkout" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    authMock.user = { id: 28 };
    view.rerender(<QueryClientProvider client={client}><PaymentCheckoutHost /></QueryClientProvider>);
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(sessionStorage.getItem("afro_ai_pending_payment")).toBeNull();
    await act(async () => { resolveStatus(Response.json({ ...payment, id: 153, status: "completed" })); });
    expect(screen.queryByText("Payment verified")).not.toBeInTheDocument();
    expect(screen.getByText(/not available for the signed-in account/i)).toBeInTheDocument();
  });

  it("cancels scheduled polling on close and aborts a live request on unmount", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(payment));
    const view = renderHost();
    act(() => openPaymentCheckout({ paymentId: 156, redirectUrl: "https://pay.pesapal.com/checkout" }));
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Close checkout" })[1]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_input, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise(() => {});
    });
    act(() => reopenPendingPaymentCheckout());
    await act(async () => { await Promise.resolve(); });
    expect(requestSignal).toBeDefined();
    view.unmount();
    expect(requestSignal?.aborted).toBe(true);
  });

  it("requires explicit review before replacing a saved pending order", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(payment));
    renderHost();
    act(() => openPaymentCheckout({ paymentId: 154, redirectUrl: "https://pay.pesapal.com/checkout?order=first" }));
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem("afro_ai_pending_payment") || "{}").paymentId).toBe(154));
    act(() => openPaymentCheckout({ paymentId: 155, redirectUrl: "https://pay.pesapal.com/checkout?order=second" }));
    expect(await screen.findByText(/One payment is already waiting/i)).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("afro_ai_pending_payment") || "{}").paymentId).toBe(154);
    fireEvent.click(screen.getByRole("button", { name: "Review new checkout" }));
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem("afro_ai_pending_payment") || "{}").paymentId).toBe(155));
  });
});
