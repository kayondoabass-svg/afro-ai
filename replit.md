# Afro AI

## Overview
Afro AI, a product of KEYO TECHNOLOGIES, is a global AI-powered platform designed to help creators build digital products such as websites, web apps, games, tools, and dashboards. Born in Africa, it serves a global market. Key capabilities include an AI co-creation assistant, multi-page app generation, project management, and ZIP project export. The platform aims to democratize digital creation and foster innovation worldwide.

## User Preferences
- Dark mode as default
- African-inspired color scheme (gold primary, warm tones)
- Pesapal for payments across Africa (Mobile Money, Visa, Mastercard, bank transfers)

## System Architecture
The platform is built with a modern web stack: React, TypeScript, Vite, Tailwind CSS, and shadcn/ui for the frontend; Express.js and Node.js for the backend; and PostgreSQL with Drizzle ORM for the database. Authentication is handled via Google OAuth 2.0. AI capabilities are powered by OpenAI, with tiered models based on user plans.

**Key Architectural Decisions & Features:**
-   **AI Co-creation:** An AI-powered code generator with a live preview, enabling iterative development. It supports context-aware generation by feeding the last generated HTML back into the prompt, allowing surgical modifications.
-   **Performance Optimization:** Code generation prioritizes lazy loading and small page sizes (<500KB) for optimal performance on slower networks common in Africa.
-   **App Publishing:** Users can publish AI-generated apps to unique subdomains (e.g., `{name}.afroaigroup.com`) managed via Cloudflare DNS. Custom domain support allows users to connect their own domains.
-   **Templating System:** Offers 21 pre-built African business templates across various categories for quick project initiation.
-   **Project Management:** A dashboard allows users to create, view, and delete projects, and provides quick-start ideas. Conversations are linked to projects for continuity.
-   **Form Builder:** Provides a robust form creation tool with various field types, submission tracking, and embeddable code snippets.
-   **Block Builder:** A visual block-based page composer with 27 pre-built section blocks across 9 categories. Users select and reorder blocks, configure app name/style/color theme, then click "Generate with AI" to produce a complete page. Passes the blueprint as a structured prompt to the AI chat via sessionStorage.
-   **Blog & CMS:** Full blog management system with create/edit/delete posts, draft/published status, cover image, excerpt, and content editor. Posts stored in the `blog_posts` DB table.
-   **Email Marketing:** Subscriber management (add, import CSV, export CSV, toggle status, delete) and campaign builder (create, edit, preview HTML, copy HTML, download). Campaigns can be generated via AI. Subscribers in `email_subscribers` table; campaigns in `email_campaigns` table.
-   **Tiered AI Models:** Different AI models (gpt-4.1-nano, gpt-4.1-mini, gpt-4.1) are offered based on user subscription plans.
-   **Context-Aware Editing:** Editor mode uses 80K character code window, auto-generated Project Map (sections, CSS vars, JS functions, nav links), Plan-Before-Action protocol, and a mandatory Reflect self-check step before output.
-   **Security:** Implements global security headers, content security policies for published apps, HTML content scanning to detect malicious patterns, and API rate limiting.
-   **Referral System:** Includes a referral program with unique codes and commission tracking for plan upgrades.
-   **Affiliate Program:** Public sign-up at `/affiliate`. Applicants fill in name, email, phone, country, social media, and promotion method. A unique `AFFxxxxxx` code is generated instantly. Admins review applications (approve/reject) in the Founder Dashboard. `affiliate_applications` table. API: `POST /api/affiliate/apply` (public), `GET /api/affiliate/applications` (founder), `PATCH /api/affiliate/applications/:id/status` (founder). 10% commission model, footer link, referral link format: `afroaigroup.com?ref=CODE`.
-   **Billing & Pricing:** Pesapal (production) for payments. Plans: Free (1 app, 30-day live then auto-suspended, gpt-4.1-nano), Pro ($15/mo, gpt-4.1-mini, 32k, unlimited apps), Business ($29.90/mo, gpt-4.1, 32k, full features). PAYG: buy credit packs ($5/$10/$20/$50 = 250/500/1000/2500 gens), $0.02/gen, user-settable spending limit. PAYG fields in DB: `payg_balance`, `payg_limit`, `payg_spent` (all cents). Auto-suspend cron runs at startup + every 6h via `storage.suspendExpiredFreeApps()`. Suspended-app page detects 30-day reason and shows upgrade CTA.
-   **Admin/Founder System:** A dedicated interface for founders/administrators to manage users, projects, published apps, and access analytics, including an AI chat for administrative commands.
-   **Analytics:** Server-side view tracking on `/site/:subdomain` — daily counts stored in `app_views` table. Dashboard at `/analytics` shows bar charts (last 14 days) per published app, total views, and top performers.
-   **Marketplace:** Community template marketplace at `/marketplace`. Users can publish their published apps as listings (title, category, tags, description). Others can browse by category/search and clone listings — which opens the HTML in AI chat for customization. Tracks download counts. `marketplace_listings` table.
-   **PWA Builder:** At `/pwa`, users select a published app and generate PWA files: `manifest.json`, `sw.js` (service worker), and an HTML head snippet. Files can be copied or downloaded. Step-by-step install guide included.
-   **Collaboration:** Project team management at `/collaborate`. Project owners can invite collaborators by email with viewer/editor roles. Invitees see shared projects under "Shared with Me" tab. `project_collaborators` table tracks invite email, role, and status.
-   **Domain Store:** Domain registration via name.com reseller API at `/domains`. Users search for domains (checks .com, .net, .org, .io, .co, .africa, .shop, .tech, .app, .store, + African TLDs). Pricing shown with 35% markup over reseller cost. Registration triggers Pesapal payment; on completion, domain is registered via name.com API. Nameserver management included. `domain_orders` table. Credentials: `NAMEDOTCOM_API_TOKEN` + `NAMEDOTCOM_API_USER`.
-   **API Integrations:** At `/integrations`. Users configure REST API connections (name, URL, method, headers, auth type: none/apikey/bearer/basic). Live test button sends request and shows response + latency. Code snippet generator outputs ready-to-paste JS fetch code. `api_integrations` table. Routes: `GET/POST /api/integrations`, `PATCH/DELETE /api/integrations/:id`, `POST /api/integrations/:id/test`, `GET /api/integrations/:id/snippet`.
-   **SEO Tools:** At `/seo`. Select any published app and configure: SEO title, meta description, keywords, robots directive, OG title, OG image. Live Google search preview updates in real time. SEO score ring (0-100) calculates from filled fields. AI analysis button (gpt-4.1-mini) gives score + issues + suggestions; "Apply AI Suggestions" auto-fills form. Settings saved to `app_seo` table; injected into `<head>` when the app is served at `/site/:subdomain`. Routes: `GET/PUT /api/seo/:publishedAppId`, `POST /api/seo/:publishedAppId/analyze`.
-   **Webhooks:** At `/webhooks`. Users register HTTP endpoints to receive real-time event payloads. Supported events: `form.submitted`, `app.viewed`, `marketplace.cloned`. Per-webhook optional HMAC-SHA256 signing (secret → `X-Afroai-Signature` header). Test delivery button. Toggle active/inactive. `webhooks` table. `fireWebhooks()` internal helper dispatches POST to all matching active hooks after events fire. `form.submitted` is triggered automatically on every form submission. Routes: `GET/POST /api/webhooks`, `PATCH/DELETE /api/webhooks/:id`, `POST /api/webhooks/:id/test`.

## External Dependencies
-   **AI Services:** OpenAI (via Replit AI Integrations), Google Gemini (for image analysis).
-   **Payment Gateway:** Pesapal (API 3.0) for mobile money, Visa, Mastercard, and bank transfers.
-   **Authentication:** Google OAuth 2.0 (passport-google-oauth20).
-   **Database:** PostgreSQL.
-   **DNS Management:** Cloudflare DNS API.