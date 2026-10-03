# About-page product comparison

Compared the current `client/src/pages/about.tsx` “What We Offer” section against routes in `client/src/App.tsx` and their current product pages. The supplied screenshot is not the current inventory. No server capabilities were inferred from route names alone.

## Already present (retained, not re-added)

AI App & Website Builder (`/website-builder`, `/app-designer`, `/chat`), Block Builder (`/builder`), African Templates (`/templates`), Domain Store (`/domain-names`, `/domains`), Afro Auth (`/afro-auth`, `/dashboard/auth`), Email API & Marketing (`/developer-email`, `/email-api`, `/email`), AI Chatbots (`/chatbot-api`, `/chatbots`), USSD Builder (`/ussd-builder`, `/ussd`), Image & Video Generation (`/media`), Forms/Blog/CMS (`/forms`, `/blog`), SEO & Analytics (`/seo`, `/analytics`), API Integrations & Webhooks (`/integrations`, `/webhooks`), Team Collaboration (`/collaborate`), Marketplace (`/marketplace`), Referral & Affiliate Programme (`/referrals`, `/affiliate`), Dev Console & Shell (`/console`, `/shell`, `/logs`, `/deployments`).

## Added

| Product | Existing route/page evidence | Description boundary |
|---|---|---|
| PWA Builder | `/pwa`, `pwa-builder.tsx` | Manifest, service worker, snippet generation for published apps |
| Knowledge Base | `/knowledge`, `knowledge.tsx` | Text, URL, and document sources |
| File Manager | `/files`, `files.tsx` | Upload, browse, manage, copy/open file links |
| Code Playground | `/playground`, `playground.tsx` | Existing Run Code workspace |
| Business Services | `/business-services`, `business-services.tsx` | Service options with per-service availability/setup and contact-mediated access; not instant API availability |
| Partner Programme | `/partners`, `/become-partner`, `/partners/directory` | Partnership information, applications, and directory |

## Corrected

Afro Auth already existed. Its card now reflects `docs/tenant-auth-release.md`: worldwide developers, email confirmation before password login, password recovery, revocable 24-hour sessions, and Google/GitHub PKCE. Added product and public integration-guide links. Removed the unsupported “complete … in minutes” promise from that card.

The Afro Auth landing page removes quality-equivalence, SMS OTP, auth webhook, SLA, and competitor-price claims. Its signup example no longer expects a signup token or recommends localStorage. Public documentation states release verification limits, not guaranteed production readiness.

## Product-description refresh

- Builder copy now distinguishes websites/browser-based apps from native app-store publishing; separate AI Agent description explains review of proposed changes.
- Developer Email API and Email Marketing have separate cards and relevant links.
- Media copy is provider-neutral and states that availability and usage limits apply.
- USSD copy distinguishes menu design/simulation from provider activation.
- Integrations/platform webhooks are not advertised as Afro Auth authentication webhooks.
- Templates are **21 editable prompt starters**, not prebuilt functional websites. Automated component tests click all 21 buttons and cards and verify the encoded project title, website type, and description passed to `/chat`. The agent reads that description into an editable input before submission. These checks do not run paid generation or certify the resulting sites' payments/bookings.
- Dev Console & Shell was explicitly excluded from this refresh and remains unchanged.
- Email Audit has an unauthenticated backend audit endpoint but its current UI route requires sign-in; it was not advertised as a public tool.

## Not counted as new products

Settings, billing, project overview, secrets, database console, checkout, auth recovery, and admin routes are supporting screens. Website Builder/App Designer are already covered by AI App & Website Builder. Email API documentation and Auth documentation are guides, not new products. GitHub Pages is an external hosting service, not an Afro AI product.
