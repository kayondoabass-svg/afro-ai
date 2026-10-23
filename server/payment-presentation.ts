import { purchaseDetails } from "../shared/purchase-details";

export async function presentPayment(payment: any, getDomain: (id: number) => Promise<any>) {
  const details = payment.purchaseDetails ?? purchaseDetails(payment.plan);
  let fulfilmentStatus = payment.status === "completed" ? (payment.purchaseDetails ? "active" : "legacy_record") : "pending";
  if (details?.category === "domain") {
    const domain = await getDomain(details.domainOrderId);
    fulfilmentStatus = domain?.userId === payment.userId ? domain.status : "review";
  }
  return { ...payment, purchaseDetails: details, purchaseDetailsSource: payment.purchaseDetails ? "snapshot" : "legacy-label",
    fulfilmentStatus, completedAt: payment.completedAt ?? null };
}
