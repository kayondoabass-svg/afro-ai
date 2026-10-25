import { CREDIT_PACKS } from "./credit-checkout";

export interface PurchaseDetails {
  packageName: string;
  category: "credits" | "platform" | "chatbot" | "ussd" | "domain" | "auth";
  billingPeriod: "one-time" | "monthly";
  quantity: number;
  credits?: number;
  domainName?: string;
  domainOrderId?: number;
  registrationYears?: number;
  projectId?: string;
  projectName?: string;
}

const names: Record<string, string> = {
  "auth-builder": "Afro Auth Builder", "auth-business": "Afro Auth Business", "auth-scale": "Afro Auth Scale",
  pro: "Afro AI Pro", business: "Afro AI Business",
  "chatbot-starter": "Chatbot Starter", "chatbot-business": "Chatbot Business", "chatbot-agency": "Chatbot Agency",
  "ussd-starter": "USSD Starter", "ussd-growth": "USSD Growth", "ussd-enterprise": "USSD Enterprise",
};

/** Server-created snapshots; clients may not supply a purchased entitlement. */
export function purchaseDetails(plan: string): PurchaseDetails | null {
  const pack = CREDIT_PACKS.find(p => `payg-${p.key}` === plan);
  if (pack) return { packageName: `${pack.credits.toLocaleString("en-US")} credits`, category: "credits", billingPeriod: "one-time", quantity: 1, credits: pack.credits };
  if (!names[plan]) return null;
  return { packageName: names[plan], category: plan.startsWith("auth-") ? "auth" : plan.startsWith("chatbot-") ? "chatbot" : plan.startsWith("ussd-") ? "ussd" : "platform",
    billingPeriod: "monthly", quantity: 1 };
}
