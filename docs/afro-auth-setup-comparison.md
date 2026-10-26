# Afro Auth setup: comparison and implementation decisions

Research checked against official documentation on 2026-10-11.

| Area | Clerk / Resend reference | Afro Auth |
| --- | --- | --- |
| Guided onboarding | Clerk production setup exposes DNS and integration steps; Resend documents add domain → verify DNS → create key. | Named project → website TXT proof → API keys → integration → private users directory. |
| Meaning of verification | Clerk distinguishes domain ownership from mailbox affiliation; Resend verifies a sending domain, not an application's users. | Website ownership, optional sending-domain verification, and each user's email confirmation are distinct. |
| Secrets | Resend displays secrets once and recommends environment variables. | Only key hashes persist; secret shown once with copy/private `.env` download. Never save secrets to browser storage. |
| Rotation | Resend recommends deploying a new key before deleting the old key. | Regenerate creates a replacement; old keys remain active until explicitly revoked after deployment. |
| User records | Auth providers isolate application users. | A private, project-scoped D1 directory, not publicly downloadable R2 authentication files. |

## Security and rollout

- New projects require website DNS activation before they can accept signups or generate production keys. Browser origins are exact allowlisted URLs, not wildcard permissions.
- Existing integrations stay active during rollout. Their existing keys are not deleted, their users are not migrated, and they are never falsely shown as DNS-verified. A real DNS proof is needed for additional production keys.
- Website TXT proof authorizes the site; it does **not** create a custom auth hostname, proxy, SSL certificate, or email-sending identity.
- Auth uses Afro AI's platform sending domain. The separate Email API still needs upstream sending-domain capacity for customer-branded senders.
- Email tokens are expiring, hashed, single-use and project-bound. A link opens a confirmation form; POST confirms the user's intent so mail-scanner GET requests cannot activate accounts.
- Email acceptance is not delivery or email ownership. Transport failures leave users unverified and return an explicit error. Login waits for confirmation.
- Domain removal and API-key revocation require an impact confirmation. Removing the last verified domain disables newly gated projects until verified again.
- Features such as enterprise SSO, production/development environment cloning and scheduled key rotation are not claimed as implemented merely because Clerk/Resend support related features.

## Sources

- Clerk production checklist: https://clerk.com/blog/how-to-take-your-clerk-app-to-prod
- Clerk domain ownership vs affiliation: https://clerk.com/docs/guides/organizations/domain-verification
- Resend setup sequence: https://resend.com/docs/knowledge-base/does-resend-require-production-approval
- Resend secret handling and safe rotation: https://resend.com/docs/knowledge-base/how-to-handle-api-keys
