export type ChatbotDomainStatus = "pending" | "verified";

export interface ChatbotDomain {
  id: string;
  hostname: string;
  status: ChatbotDomainStatus;
  createdAt: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  verification: {
    type: "TXT";
    name: string;
    value: string;
    ttl: number;
  };
}

export interface ChatbotInstallationResult {
  verified: boolean;
  code: string;
  message: string;
  url: string;
  checkedAt: string;
}

export interface ChatbotVisitorTestResult {
  succeeded: boolean;
  checkedAt: string;
}

export interface ChatbotVerification {
  enforcement: "legacy" | "required";
  websiteHostname: string | null;
  statusLabel: string;
  domains: ChatbotDomain[];
  installation: ChatbotInstallationResult | null;
  visitorTest: ChatbotVisitorTestResult | null;
}
