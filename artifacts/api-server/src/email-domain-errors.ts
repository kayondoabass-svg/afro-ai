export function emailDomainError(error: unknown): { status: number; code: string; error: string } {
  const message = error instanceof Error ? error.message : "";
  if (/(domain.{0,50}limit|plan includes.{0,20}domain|upgrade to add more)/i.test(message)) {
    return { status: 503, code: "EMAIL_DOMAIN_CAPACITY", error: "The email provider has reached its sending-domain limit. Contact Afro AI support to enable more sending domains. Retrying or upgrading your customer app will not resolve this provider limit. Existing verified domains are not changed." };
  }
  if (/(not set|unauthorized|restricted|api.?key|forbidden)/i.test(message)) {
    return { status: 503, code: "EMAIL_PROVIDER_CONFIGURATION", error: "Sending-domain setup is unavailable because the email provider credentials need administrator attention. Contact Afro AI support; do not enter provider credentials into this form." };
  }
  if (/(already exists|already registered)/i.test(message)) {
    return { status: 409, code: "EMAIL_DOMAIN_EXISTS", error: "This domain is already registered with the email provider. Contact Afro AI support to reconcile its ownership. It has not been assigned to another account." };
  }
  return { status: 503, code: "EMAIL_DOMAIN_UNAVAILABLE", error: "The sending-domain provider could not complete this request. No verification has been granted. Try again later or contact Afro AI support." };
}
