import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle2, CircleAlert, Clock3, Loader2, LockKeyhole, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { creditCheckoutUrl } from "@shared/credit-checkout";

export type PaymentCheckoutOrder = {
  paymentId: number;
  redirectUrl: unknown;
  amount?: string;
  currency?: string;
  plan?: string;
  userId?: string | number;
  purchaseDetails?: PurchaseDetails | null;
};

type PaymentState = "preparing" | "pending" | "completed" | "failed" | "delayed" | "error" | "review";
type PurchaseDetails = {
  packageName?: string;
  category?: string;
  billingPeriod?: string;
  quantity?: number;
  credits?: number;
  domainName?: string;
  domainOrderId?: number | string;
  registrationYears?: number;
  projectId?: number | string;
};
type PaymentStatus = {
  id: number;
  status: "pending" | "completed" | "failed";
  amount: string;
  currency: string;
  plan: string;
  credits: number | null;
  userId?: string | number;
  merchantReference?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  purchaseDetails?: PurchaseDetails | null;
  fulfilmentStatus?: string | null;
};
type CheckoutRecord = {
  paymentId: number;
  returnTo: string;
  accountId: string;
  providerUrl?: string;
};
type PreparedOrder = {
  paymentId: number;
  providerUrl: string;
  returnTo: string;
};

const SESSION_KEY = "afro_ai_pending_payment";
const OPEN_EVENT = "afro-ai:open-payment-checkout";
const MAX_POLL_MS = 5 * 60_000;

function accountKey(user: unknown): string {
  const id = (user as { id?: string | number } | null)?.id;
  return id === undefined || id === null ? "" : String(id);
}

function safeProjectPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

function checkoutReturnPath() {
  const requested = new URLSearchParams(window.location.search).get("returnTo");
  return safeProjectPath(requested || window.location.pathname + window.location.search);
}

function saveCheckout(record: CheckoutRecord) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(record)); } catch { /* storage may be unavailable */ }
}

function clearCheckout() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage may be unavailable */ }
}

function readCheckout(): CheckoutRecord | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutRecord>;
    if (!Number.isSafeInteger(parsed.paymentId) || Number(parsed.paymentId) <= 0 ||
        typeof parsed.accountId !== "string" || typeof parsed.returnTo !== "string") {
      clearCheckout();
      return null;
    }
    let providerUrl: string | undefined;
    if (typeof parsed.providerUrl === "string") {
      try {
        providerUrl = creditCheckoutUrl(parsed.providerUrl);
      } catch {
        clearCheckout();
        return null;
      }
    }
    return {
      paymentId: Number(parsed.paymentId),
      accountId: parsed.accountId,
      returnTo: safeProjectPath(parsed.returnTo),
      providerUrl,
    };
  } catch {
    clearCheckout();
    return null;
  }
}

export function openPaymentCheckout(order: PaymentCheckoutOrder) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: order }));
}

export function reopenPendingPaymentCheckout() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function PaymentCheckoutHost() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PaymentState>("preparing");
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [ownerAccountId, setOwnerAccountId] = useState("");
  const [message, setMessage] = useState("");
  const [returnTo, setReturnTo] = useState("/dashboard");
  const [retryToken, setRetryToken] = useState(0);
  const [legacyStatusOnly, setLegacyStatusOnly] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<PreparedOrder | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const delayRef = useRef(4_000);
  const restoreAttempted = useRef(false);
  const openRef = useRef(false);
  const activePaymentId = useRef<number | null>(null);
  const ownerAccount = useRef("");
  const currentAccount = useRef(accountKey(user));
  const restoredProviderUrl = useRef<string | null>(null);
  currentAccount.current = accountKey(user);

  const cancelActive = useCallback(() => {
    requestGeneration.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const startPreparedOrder = useCallback((order: PreparedOrder) => {
    cancelActive();
    const owner = currentAccount.current;
    openRef.current = true;
    activePaymentId.current = order.paymentId;
    ownerAccount.current = owner;
    restoredProviderUrl.current = null;
    setOpen(true);
    setPaymentId(order.paymentId);
    setOwnerAccountId(owner);
    setPaymentUrl(order.providerUrl);
    setReturnTo(order.returnTo);
    setLegacyStatusOnly(false);
    setReviewOrder(null);
    setPayment(null);
    setMessage("");
    setState("preparing");
    delayRef.current = 4_000;
    startedAt.current = Date.now();
    saveCheckout({
      paymentId: order.paymentId,
      accountId: owner,
      returnTo: order.returnTo,
      providerUrl: order.providerUrl,
    });
  }, [cancelActive]);

  const resetAndOpen = useCallback((order?: PaymentCheckoutOrder) => {
    cancelActive();
    openRef.current = true;
    setOpen(true);
    setPayment(null);
    setMessage("");
    setReviewOrder(null);
    delayRef.current = 4_000;
    startedAt.current = Date.now();
    if (!order) {
      const saved = readCheckout();
      if (!saved) {
        setState("error");
        setMessage("No pending checkout could be restored.");
        setPaymentId(null);
        activePaymentId.current = null;
        setPaymentUrl("");
        setOwnerAccountId("");
        ownerAccount.current = "";
        restoredProviderUrl.current = null;
        setLegacyStatusOnly(false);
        return;
      }
      if (authLoading) return;
      if (!user || saved.accountId !== accountKey(user)) {
        clearCheckout();
        setState("error");
        setMessage("This pending checkout is not available for the signed-in account.");
        setPaymentId(null);
        activePaymentId.current = null;
        setPaymentUrl("");
        setOwnerAccountId("");
        ownerAccount.current = "";
        restoredProviderUrl.current = null;
        setLegacyStatusOnly(false);
        return;
      }
      activePaymentId.current = saved.paymentId;
      ownerAccount.current = saved.accountId;
      restoredProviderUrl.current = saved.providerUrl ?? null;
      setPaymentId(saved.paymentId);
      setOwnerAccountId(saved.accountId);
      setReturnTo(saved.returnTo);
      setPaymentUrl("");
      setLegacyStatusOnly(!saved.providerUrl);
      setState("preparing");
      return;
    }
    const id = Number(order.paymentId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      setState("error");
      setMessage("The checkout could not be prepared. Please start again from your project.");
      setPaymentId(null);
      activePaymentId.current = null;
      setPaymentUrl("");
      setOwnerAccountId("");
      ownerAccount.current = "";
      restoredProviderUrl.current = null;
      return;
    }
    let validatedUrl: string;
    try {
      validatedUrl = creditCheckoutUrl(order.redirectUrl);
    } catch {
      setState("error");
      setMessage("The secure payment page could not be validated. No payment was confirmed.");
      setPaymentId(null);
      activePaymentId.current = null;
      setPaymentUrl("");
      setOwnerAccountId("");
      ownerAccount.current = "";
      restoredProviderUrl.current = null;
      return;
    }
    const owner = accountKey(user);
    if (!owner) {
      setState("error");
      setMessage("Sign in again to open a secure checkout.");
      setPaymentId(null);
      activePaymentId.current = null;
      setPaymentUrl("");
      setOwnerAccountId("");
      ownerAccount.current = "";
      return;
    }
    if (order.userId !== undefined && String(order.userId) !== owner) {
      setState("error");
      setMessage("This checkout belongs to a different signed-in account. No payment page was opened.");
      setPaymentId(null);
      activePaymentId.current = null;
      setPaymentUrl("");
      setOwnerAccountId("");
      ownerAccount.current = "";
      restoredProviderUrl.current = null;
      setLegacyStatusOnly(false);
      return;
    }
    const existing = readCheckout();
    if (existing && existing.accountId !== owner) clearCheckout();
    if (existing && existing.accountId === owner && existing.paymentId !== id) {
      setPaymentId(null);
      activePaymentId.current = null;
      setPaymentUrl("");
      ownerAccount.current = owner;
      setOwnerAccountId(owner);
      setLegacyStatusOnly(false);
      setReviewOrder({
        paymentId: id,
        providerUrl: validatedUrl,
        returnTo: checkoutReturnPath(),
      });
      setState("review");
      return;
    }
    startPreparedOrder({
      paymentId: id,
      providerUrl: validatedUrl,
      returnTo: checkoutReturnPath(),
    });
  }, [authLoading, user, cancelActive, startPreparedOrder]);

  useEffect(() => {
    const onOpen = (event: Event) => resetAndOpen((event as CustomEvent<PaymentCheckoutOrder | undefined>).detail);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [resetAndOpen]);

  useEffect(() => () => {
    cancelActive();
    openRef.current = false;
  }, [cancelActive]);

  useEffect(() => {
    if (authLoading || open || restoreAttempted.current) return;
    restoreAttempted.current = true;
    const saved = readCheckout();
    if (!saved) return;
    resetAndOpen();
  }, [authLoading, user, open, resetAndOpen]);

  const refreshAfterCompletion = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["/api/payg/status"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
  }, [queryClient]);

  const checkStatus = useCallback(async (id: number, manual = false) => {
    const owner = ownerAccount.current;
    if (!openRef.current || activePaymentId.current !== id || !owner ||
        currentAccount.current !== owner) return;
    cancelActive();
    const generation = requestGeneration.current;
    const abortController = new AbortController();
    controller.current = abortController;
    const isCurrent = () =>
      requestGeneration.current === generation &&
      !abortController.signal.aborted &&
      openRef.current &&
      activePaymentId.current === id &&
      ownerAccount.current === owner &&
      currentAccount.current === owner;
    try {
      const response = await fetch(`/api/payments/${id}/status`, {
        credentials: "include",
        cache: "no-store",
        signal: abortController.signal,
      });
      if (!isCurrent()) return;
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        clearCheckout();
        setState("error");
        setMessage(response.status === 401
          ? "Your sign-in is no longer valid. Sign in again before checking this payment."
          : "This checkout is not available for this account.");
        setPayment(null);
        setPaymentId(null);
        setPaymentUrl("");
        restoredProviderUrl.current = null;
        activePaymentId.current = null;
        ownerAccount.current = "";
        setOwnerAccountId("");
        setLegacyStatusOnly(false);
        return;
      }
      if (!response.ok) throw new Error("We could not check payment status right now.");
      const data = await response.json() as PaymentStatus;
      if (!isCurrent()) return;
      if (data.id !== id ||
          (data.userId !== undefined && String(data.userId) !== owner) ||
          !["pending", "completed", "failed"].includes(data.status)) {
        throw new Error("The payment status response was invalid.");
      }
      setPayment(data);
      if (data.status === "completed") {
        setState("completed");
        setPaymentUrl("");
        restoredProviderUrl.current = null;
        const isDomainOrder = data.purchaseDetails?.category?.toLowerCase() === "domain" || !!data.purchaseDetails?.domainName;
        if (isDomainOrder && data.fulfilmentStatus !== "active") return;
        clearCheckout();
        refreshAfterCompletion();
        return;
      }
      if (data.status === "failed") {
        setState("failed");
        clearCheckout();
        setPaymentUrl("");
        restoredProviderUrl.current = null;
        return;
      }
      if (restoredProviderUrl.current) setPaymentUrl(restoredProviderUrl.current);
      const elapsed = Date.now() - startedAt.current;
      if (elapsed >= MAX_POLL_MS) {
        setState("delayed");
        return;
      }
      setState("pending");
      if (manual) delayRef.current = 4_000;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (isCurrent()) void checkStatus(id);
      }, delayRef.current);
      delayRef.current = Math.min(15_000, Math.round(delayRef.current * 1.35));
    } catch (error) {
      if (!isCurrent()) return;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to check payment status.");
    }
  }, [cancelActive, refreshAfterCompletion]);

  const currentAccountId = accountKey(user);
  useLayoutEffect(() => {
    if (!open || authLoading) return;
    if (ownerAccountId && (!user || currentAccountId !== ownerAccountId)) {
      cancelActive();
      clearCheckout();
      setPayment(null);
      setPaymentUrl("");
      restoredProviderUrl.current = null;
      activePaymentId.current = null;
      ownerAccount.current = "";
      setPaymentId(null);
      setOwnerAccountId("");
      setLegacyStatusOnly(false);
      setState("error");
      setMessage("This checkout is not available for the signed-in account.");
      return;
    }
    if (!paymentId) return;
    if (!user || !ownerAccountId) return;
    void checkStatus(paymentId);
    return () => cancelActive();
  }, [open, paymentId, currentAccountId, ownerAccountId, authLoading, retryToken, checkStatus, cancelActive]);

  const close = () => {
    openRef.current = false;
    cancelActive();
    setOpen(false);
  };
  const manualRetry = () => {
    cancelActive();
    startedAt.current = Date.now();
    delayRef.current = 4_000;
    setState("pending");
    setRetryToken(token => token + 1);
  };
  const checkFulfilmentAgain = () => {
    cancelActive();
    startedAt.current = Date.now();
    delayRef.current = 4_000;
    setRetryToken(token => token + 1);
  };
  const resumeSavedOrder = () => resetAndOpen();
  const confirmNewOrder = () => {
    if (reviewOrder) startPreparedOrder(reviewOrder);
  };
  const continueProject = () => {
    close();
    navigate(safeProjectPath(returnTo));
  };

  const accountMismatch = !!ownerAccountId && ownerAccountId !== currentAccountId;
  const viewState: PaymentState = accountMismatch ? "error" : state;
  const visiblePayment = accountMismatch ? null : payment;
  const visiblePaymentUrl = accountMismatch ? "" : paymentUrl;
  const title = viewState === "completed" ? "Payment verified" :
    viewState === "failed" ? "Payment not completed" :
    viewState === "delayed" ? "Still waiting for confirmation" :
    viewState === "review" ? "Another checkout is already pending" :
    viewState === "error" ? "Checkout needs attention" :
    viewState === "pending" ? "Approve your payment" : "Preparing secure checkout";
  const paymentOrigin = visiblePaymentUrl ? new URL(visiblePaymentUrl).origin : "";
  const purchase = visiblePayment?.purchaseDetails;
  const domainPurchase = purchase?.category?.toLowerCase() === "domain" || !!purchase?.domainName;
  const domainActive = visiblePayment?.fulfilmentStatus === "active";
  const completedDescription = domainPurchase && !domainActive
    ? "Payment received. Your domain order is being processed; registration is not confirmed yet."
    : domainPurchase
    ? "Payment confirmed and domain fulfilment is active."
    : "Payment confirmed. A receipt email may be sent, but email delivery is not guaranteed.";
  const fulfillmentLabel = visiblePayment?.fulfilmentStatus
    ? visiblePayment.fulfilmentStatus === "active" ? "Active" :
      ["registering", "review"].includes(visiblePayment.fulfilmentStatus) ? visiblePayment.fulfilmentStatus : visiblePayment.fulfilmentStatus
    : null;

  return (<>
    {!open && paymentId && ownerAccountId === currentAccountId &&
      !["completed", "failed", "review"].includes(state) && (
      <Button className="fixed bottom-5 right-5 z-50 shadow-lg" onClick={() => resetAndOpen()} data-testid="button-reopen-payment">
        Check pending payment
      </Button>
    )}
    <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[94dvh] overflow-y-auto border-amber-500/25 bg-background p-0 sm:rounded-2xl" data-testid="payment-checkout-dialog">
        <div className="border-b border-border/70 bg-card/80 px-5 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <span className="font-serif text-xl font-bold" aria-hidden="true">A</span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Afro AI · Secure checkout</p>
                <p className="text-sm text-muted-foreground">Payment handled securely by Pesapal</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" aria-label="Close checkout" onClick={close} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogHeader className="mt-5 text-left">
            <DialogTitle className="font-serif text-2xl">{title}</DialogTitle>
            <DialogDescription>
              {viewState === "completed" ? domainPurchase
                ? domainActive ? "The server verified payment and reports active domain fulfilment." : "The server verified payment. Domain fulfilment is still in progress."
                : "The server verified this payment." :
                viewState === "review" ? "A previous payment is still awaiting confirmation. Review before switching to this newer checkout." :
                "Choose a payment method in Pesapal. Your payment is not confirmed until Afro AI verifies it."}
            </DialogDescription>
          </DialogHeader>
          {visiblePayment && (
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-primary/20 bg-background/70 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Order</p>
                <p className="font-medium">{purchase?.packageName || visiblePayment.plan}</p>
              </div>
              <p className="font-mono text-lg font-semibold text-primary">{visiblePayment.currency} {visiblePayment.amount}</p>
            </div>
          )}
        </div>

        <div className="grid gap-5 px-5 py-5 sm:px-7 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            {viewState === "review" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-8 text-center">
                <CircleAlert className="mx-auto mb-3 h-9 w-9 text-primary" />
                <h3 className="text-lg font-semibold">One payment is already waiting</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Keep using the saved checkout, or explicitly switch to this new order. Switching replaces the saved recovery link for the previous order; that provider payment may still be open.
                </p>
                <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                  <Button variant="outline" onClick={resumeSavedOrder}>Resume saved checkout</Button>
                  <Button onClick={confirmNewOrder}>Review new checkout</Button>
                </div>
              </div>
            )}
            {visiblePaymentUrl && viewState !== "completed" && viewState !== "failed" && viewState !== "review" && (
              <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
                <iframe
                  src={visiblePaymentUrl}
                  title="Pesapal secure payment form for Afro AI"
                  className="h-[min(58dvh,560px)] min-h-[380px] w-full bg-white"
                  allow={`payment ${paymentOrigin}`}
                  referrerPolicy="strict-origin-when-cross-origin"
                  data-testid="payment-provider-frame"
                />
              </div>
            )}
            {!visiblePaymentUrl && viewState !== "completed" && viewState !== "failed" && viewState !== "delayed" && viewState !== "error" && viewState !== "review" && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/30 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="font-medium">Connecting to the secure payment service</p>
                <p className="max-w-sm px-4 text-sm text-muted-foreground">Loading your order details securely. This does not confirm payment.</p>
              </div>
            )}
            {(viewState === "completed" || viewState === "failed" || viewState === "delayed" || viewState === "error") && (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-border bg-muted/25 px-6 py-8 text-center">
                {viewState === "completed" ? <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" /> :
                  viewState === "delayed" ? <Clock3 className="mb-3 h-10 w-10 text-primary" /> :
                    <CircleAlert className="mb-3 h-10 w-10 text-destructive" />}
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  {viewState === "completed" ? completedDescription :
                    viewState === "failed" ? "The payment was not completed. Nothing was added to your account." :
                      viewState === "delayed" ? "Mobile money or bank approval can take longer. You can check again; no new order will be created." :
                        message || "Please try checking again. No new payment request has been submitted."}
                </p>
              </div>
            )}
            {visiblePayment && (
              <div className="mt-3 rounded-xl border border-border bg-card/70 px-4 py-3" data-testid="payment-confirmation-details">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment record</p>
                <dl className="mt-2 grid grid-cols-1 gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">User ID</dt><dd className="break-all font-mono" data-testid="payment-user-id">{visiblePayment.userId ?? "Unavailable"}</dd></div>
                  <div><dt className="text-muted-foreground">Payment ID</dt><dd className="font-mono" data-testid="payment-id">{visiblePayment.id}</dd></div>
                  {visiblePayment.merchantReference && <div><dt className="text-muted-foreground">Reference</dt><dd className="break-all font-mono">{visiblePayment.merchantReference}</dd></div>}
                  {visiblePayment.createdAt && <div><dt className="text-muted-foreground">Created</dt><dd>{new Date(visiblePayment.createdAt).toLocaleString()}</dd></div>}
                  {visiblePayment.completedAt && <div><dt className="text-muted-foreground">Completed</dt><dd>{new Date(visiblePayment.completedAt).toLocaleString()}</dd></div>}
                  {(purchase?.quantity !== undefined || purchase?.credits !== undefined) && (
                    <div><dt className="text-muted-foreground">Units</dt><dd>{purchase.quantity ?? purchase.credits}{purchase.billingPeriod ? ` · ${purchase.billingPeriod}` : ""}</dd></div>
                  )}
                  {purchase?.registrationYears !== undefined && <div><dt className="text-muted-foreground">Registration period</dt><dd>{purchase.registrationYears} year{purchase.registrationYears === 1 ? "" : "s"}</dd></div>}
                  {purchase?.domainName && <div><dt className="text-muted-foreground">Domain</dt><dd className="break-all">{purchase.domainName}</dd></div>}
                  {fulfillmentLabel && <div className="sm:col-span-2"><dt className="text-muted-foreground">Fulfilment</dt><dd className="font-medium capitalize">{fulfillmentLabel}</dd></div>}
                </dl>
                {domainPurchase && !domainActive && viewState === "completed" && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Your payment is verified, but the domain is not confirmed active yet. <button type="button" className="underline underline-offset-2 text-primary" onClick={() => { close(); navigate("/domains"); }}>View domain orders</button>
                  </p>
                )}
              </div>
            )}
            {viewState === "pending" && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  {legacyStatusOnly
                    ? "This saved checkout predates secure iframe recovery. Afro AI can still check its payment status, but cannot reopen the provider form from this record. If it remains pending, use the original open checkout or start a new order only after reviewing the existing payment."
                    : "Approve the prompt on your phone or complete your bank authorization. Keep this window open while Afro AI checks the verified payment status."}
                </p>
              </div>
            )}
          </div>
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4 text-primary" /> Payment safety</div>
              <p className="text-xs leading-relaxed text-muted-foreground">Your card, mobile-money PIN, and bank authorization details are entered only on Pesapal’s branded payment form. Afro AI never asks for those details here.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Mobile money</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Select your network in Pesapal, then approve the payment prompt on the phone linked to that mobile-money account. Bank approval may happen separately in your bank app.</p>
            </div>
            {visiblePayment?.credits !== null && visiblePayment?.credits !== undefined && viewState === "completed" && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Credits added</p>
                <p className="mt-1 text-xl font-semibold">{visiblePayment.credits.toLocaleString()}</p>
              </div>
            )}
          </aside>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs text-muted-foreground">Closing this window does not cancel a payment in progress.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {(viewState === "delayed" || (viewState === "error" && paymentId !== null)) && (
              <Button variant="outline" onClick={manualRetry}>Check status again</Button>
            )}
            {viewState === "completed" && domainPurchase && !domainActive && (
              <Button variant="outline" onClick={checkFulfilmentAgain} data-testid="button-check-domain-fulfilment">Check fulfilment again</Button>
            )}
            {viewState === "review" ? (
              <Button variant="outline" onClick={close}>Close checkout</Button>
            ) : viewState === "completed" ? (
              domainPurchase
                ? <Button onClick={() => { close(); navigate("/domains"); }}>View domain orders</Button>
                : <Button onClick={continueProject} data-testid="button-continue-project">Continue to project</Button>
            ) : (
              <Button variant="outline" onClick={close}>Close checkout</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog></>
  );
}
