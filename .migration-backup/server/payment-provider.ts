import * as pesapal from "./pesapal";

/** Dashboard checkout depends on this boundary, not a client-selected gateway.
 * Add future founder-approved adapters here; never fail over an ambiguous charge.
 */
export interface PaymentProvider {
  id: string;
  registerIpnUrl: typeof pesapal.registerIpnUrl;
  submitOrder: typeof pesapal.submitOrder;
  getTransactionStatus: typeof pesapal.getTransactionStatus;
  isPaymentComplete: typeof pesapal.isPaymentComplete;
  isPaymentFailed: typeof pesapal.isPaymentFailed;
}

export const paymentProvider: PaymentProvider = { id: "pesapal", ...pesapal };
export const { registerIpnUrl, submitOrder, getTransactionStatus, isPaymentComplete, isPaymentFailed } = paymentProvider;
