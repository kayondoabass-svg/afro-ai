# Afro AI

## Overview
Afro AI, a product of KEYO TECHNOLOGIES, is a global AI-powered platform enabling creators to build digital products like websites, web apps, games, tools, and dashboards. Originating from Africa, it caters to a worldwide market. Its core features include an AI co-creation assistant, multi-page application generation, comprehensive project management, and ZIP project export functionality. The platform's vision is to democratize digital creation and foster innovation globally.

## User Preferences
- Dark mode as default
- African-inspired color scheme (gold primary, warm tones)
- Pesapal for payments across Africa (Mobile Money, Visa, Mastercard, bank transfers)

## System Architecture
The platform is built on a modern web stack: React, TypeScript, Vite, Tailwind CSS, and shadcn/ui for the frontend; Express.js and Node.js for the backend; and PostgreSQL with Drizzle ORM for the database. Authentication is handled by a dedicated Cloudflare Worker (`cf-auth`) covering email/password, Google, and GitHub sign-in; Express trusts the Worker's session cookie via a small bridge middleware. AI capabilities are powered by OpenAI, with tiered models aligning with user subscription plans.

**Key Architectural Decisions & Features:**
-   **AI Co-creation:** An AI-powered code generator provides a live preview and supports iterative development through context-aware generation.
-   **Performance Optimization:** Prioritizes lazy loading and small page sizes (<500KB) for optimal performance.
-   **App Publishing:** Users can publish apps to unique subdomains managed via Cloudflare DNS, with custom domain support.
-   **Templating System:** Offers 21 pre-built African business templates for quick project initiation.
-   **Project Management:** A dashboard facilitates project creation, viewing, deletion, and quick-start ideas, linking conversations to projects.
-   **Form Builder:** A robust tool for creating forms with various field types, submission tracking, and embeddable code.
-   **Block Builder:** A visual, block-based page composer with 27 pre-built sections, allowing users to configure and generate pages with AI.
-   **Blog & CMS:** Full blog management system for creating, editing, and publishing posts.
-   **Email Marketing:** Manages subscribers and provides an AI-powered campaign builder.
-   **Tiered AI Models:** Utilizes different OpenAI models (gpt-4.1-nano, gpt-4.1-mini, gpt-4.1) based on user subscription tiers.
-   **Context-Aware Editing:** Features an 80K character code window, auto-generated Project Map, Plan-Before-Action protocol, and Reflect self-check for precise AI modifications.
-   **Security:** Implements global security headers, content security policies, HTML content scanning, and API rate limiting.
-   **Referral System:** Includes a referral program with unique codes and commission tracking.
-   **Affiliate Program:** A public sign-up and management system for affiliates with a 10% commission model.
-   **Billing & Pricing:** Integrates Pesapal for payments, offering Free, Pro, Business plans, and Pay-As-You-Go credit packs. Includes cron jobs for managing free app suspensions.
-   **Admin/Founder System:** A dedicated interface for managing users, projects, published apps, analytics, and administrative AI commands.
-   **Analytics:** Tracks server-side app views and displays performance metrics on a dedicated dashboard.
-   **Marketplace:** A community template marketplace where users can publish and clone apps.
-   **PWA Builder:** Allows users to generate PWA files (manifest.json, sw.js) and an HTML head snippet for published apps.
-   **Collaboration:** Project owners can invite collaborators with viewer/editor roles.
-   **Domain Store:** Facilitates domain registration via name.com reseller API, including search, pricing, and nameserver management.
-   **API Integrations:** Users can configure and test REST API connections, generating ready-to-paste JS fetch code snippets.
-   **SEO Tools:** Configures SEO settings (title, description, keywords, OG tags) for published apps, including a live Google search preview and AI analysis.
-   **Webhooks:** Users can register HTTP endpoints to receive real-time event payloads for various platform events.
-   **Auth Builder:** Integrates Firebase Auth into apps, providing branded login screens and handling user authentication.
-   **Version History:** Automatically saves snapshots of generated HTML pages, allowing users to preview and restore previous versions.
-   **Experience Level System:** Adapts AI communication style (Beginner, Intermediate, Expert) based on user preference.
-   **USSD Builder:** A standalone revenue stream providing a platform for building USSD applications with regional pricing and use case showcases.
-   **Files & Storage:** Manages uploaded files, tracks ZIP exports, and provides a CDN browser for external libraries.
-   **Overview:** A personal dashboard displaying key metrics, recent activity, and quick actions.
-   **Secrets Manager:** Securely stores environment variables and API keys per published app or globally.
-   **Activity Logs:** Provides a full event stream of user actions, filterable by type and searchable.
-   **Dev Console (Unified Dashboard):** A professional IDE-style developer dashboard at /console with three tabs — Activity (color-coded, searchable, filterable real-time log feed), Terminal (interactive Xterm.js bash shell with admin key protection), and Deployments (list of published apps with status). Includes a persistent status bar showing server health, shell state, branch, and port.
-   **Interactive Shell:** Real-time interactive bash terminal inside the Dev Console Terminal tab, powered by node-pty and Socket.io. Protected by SHELL_SECRET admin key.
-   **Sidebar Search:** Filters navigation items in real time.
-   **Email API:** A transactional email sending service powered by AWS SES, offering API keys, domain verification, and sending logs.
-   **SES Bounce/Complaint Pipeline:** Public webhook at `/api/ses/sns` receives SNS notifications from SES (Bounce, Complaint, Delivery). Every message is signature-verified against the SNS signing cert (host whitelisted to `sns.*.amazonaws.com`), `SubscribeURL` handshake is auto-confirmed, and the `SES_SNS_TOPIC_ARN` env var optionally pins the allowed topic. Hard bounces and all complaints are added to a permanent `email_suppressions` table; soft bounces are logged but not suppressed. Both the public `/api/email-api/send` route and the platform `mailer.ts` filter recipients against the suppression list before calling SES, protecting sender reputation. Founder-only admin endpoints under `/api/admin/email-suppressions` and `/api/admin/email-reputation` expose the list and overall reputation stats (sent / delivered / bounce rate / complaint rate).
-   **Chatbot API:** Enables users to create embeddable AI chatbots for external websites with a knowledge base and brand customization.
-   **Team Management (Founder):** Country-first staff promotion at `/team` (founder-only). Founder picks one of 25 African countries, searches existing clients, then assigns one of 20 predefined roles and one of three access tiers (read-only / editor / full-admin). Personal details (phone, city, address), photo (JPG/PNG/WEBP) and ID document (PDF/JPG/PNG) optional, all uploaded to R2 with magic-byte content validation. Confidential ID documents are streamed through an authenticated backend endpoint (`/api/admin/team/:id/id-document`) gated to founders + active HR managers in the same country only — the file URL is never returned to the browser. Duplicate active membership for the same user/country is blocked at app + DB level via the partial unique index `team_members_unique_active_per_country (user_id, country) WHERE status <> 'removed'`. The companion `/api/team/me` endpoint exposes the calling user's role/tier/country/manager flag for the future staff dashboard. Constants live in `shared/team-constants.ts` (TEAM_ROLES, MANAGER_ROLES, CONFIDENTIAL_DOC_VIEWER_ROLES, TEAM_TIERS, AFRICAN_COUNTRIES).

## Production Deployment

Production runs on a DigitalOcean droplet behind Caddy + Cloudflare, on the `afroaigroup.com` domain. (Droplet SSH details are kept out of source — see Replit Secrets / your password manager.) The Node service is managed by systemd as `afro-ai.service` with `WorkingDirectory=/opt/afro-ai` and `EnvironmentFile=/srv/afro-ai/shared/.env` (so prod secrets live outside the git checkout and survive any redeploy).

**Standard deploy** — push to `origin/main`, then on the droplet run:

```
bash /opt/afro-ai/scripts/deploy.sh
```

**Important:** do NOT run `git pull` manually before calling the script — the script does its own pull, and a manual pull beforehand will make it think nothing changed (it will still detect a stale `dist/` via `dist/.deployed_sha` and rebuild, but the log line will be confusing). Just call the script.

`scripts/deploy.sh` pulls from origin, builds client + server, restarts the service, runs a `/api/health` check, and purges the Cloudflare cache. Safety guarantees:

- **Concurrency lock** (`flock` on `/var/lock/afro-ai-deploy.lock`) — refuses to start if another deploy is already running.
- **Refuses dirty working tree** — won't silently throw away an uncommitted hotfix on the droplet.
- **Snapshots the live `dist/` as `dist.prev` before building** (cheap hardlink copy). If the build fails, the systemctl restart fails, OR the health check fails, the snapshot is restored and the service runs the old build. The site stays live even if the rollback rebuild itself would fail.
- **Health check retries** 5× with 2-second backoff before declaring failure.
- **Build timeout** (`BUILD_TIMEOUT`, default 600s) prevents a runaway build from blocking forever.
- **Logs every run** to `/var/log/afro-ai-deploy.log` with UTC timestamps.

Tunable env vars: `PORT` (default 5000, used for health check URL), `BUILD_TIMEOUT` (default 600s).

**Manual rollback** — to roll back without a new commit:

```
bash /opt/afro-ai/scripts/rollback.sh           # one commit back
bash /opt/afro-ai/scripts/rollback.sh <sha>     # specific commit
```

(Use `git -C /opt/afro-ai log --oneline -10` first to pick a SHA.)

**One-time bootstrap** — after the very first time these scripts land on the droplet:

```
chmod +x /opt/afro-ai/scripts/deploy.sh /opt/afro-ai/scripts/rollback.sh
touch /var/log/afro-ai-deploy.log && chown root:root /var/log/afro-ai-deploy.log
```

Required env vars in `/srv/afro-ai/shared/.env`: everything the app needs at runtime, plus `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` (token must have **Zone → Cache Purge → Purge** permission for `afroaigroup.com`) for the auto-purge step.

## External Dependencies
-   **AI Services:** Google Gemini (primary) with OpenAI fallback. Unified by `server/ai-chat-provider.ts` which exposes `aiChatComplete({ tier })`. Provider order is controlled by `AI_PRIMARY_PROVIDER` (default `gemini`); the helper auto-falls-back to OpenAI on auth/quota errors (HTTP 401/402/403/429, `insufficient_quota`, `invalid_api_key`, billing). Gemini is reached via its OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`) so the same client code works for both. **Tier-based model routing**: starter→`gemini-2.5-flash-lite` (~$0.10/1M), pro→`gemini-2.5-flash` (~$0.30/1M), business+payg→`gemini-2.5-pro` (~$1.25/1M). (Note: `gemini-2.0-flash` was retired by Google for new keys; we use `2.5-flash-lite` as the cheapest current model.) Per-tier output-token cap (starter 2k, pro 8k, business 16k, payg 32k) prevents a single reply from exceeding the user's plan economics. Used by `/api/demo-chat`, `/api/widget-chat/:apiKey`, `/api/v1/chatbot/message`, and the USSD AI route. `OPENAI_MODEL` and `GEMINI_MODEL` env vars still override defaults if set (useful for incident pinning).
-   **Image Generation:** Imagen 3 (`imagen-3.0-generate-002`) via Gemini REST in `server/imagen.ts` is primary; OpenAI `gpt-image-1` is the auto-fallback. Routed at `POST /api/generate-image` (`server/replit_integrations/image/routes.ts`). Aspect ratio configurable (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`).
-   **Video Generation:** Veo 2 (`veo-2.0-generate-001`) via Gemini REST in `server/veo.ts`, exposed at `POST /api/generate-video`. **Business-plan only** (starter + pro caps are 0/day). Hard-capped at 5 seconds per clip, 5 clips/day Business / 50/day PAYG. Async polling — calls can take 30-90s and time out at 5min. Wholesale cost ≈ $0.35/sec, plan-bounded so worst-case Business AI spend stays under $10/day per user.
-   **Daily quota caps (May 2026, applied to all users):** starter 30 chats / 3 images / 10 audio / 0 video; pro 500 / 30 / 200 / 0; business 1500 / 100 / 400 / 5; payg 5000 / 500 / 1000 / 50. Defined in `server/replit_integrations/quota.ts` `DAILY_REQUEST_LIMITS`, enforced via `aiQuotaGuard(kind)` middleware on all AI routes.
-   **Payment Gateway:** Pesapal (API 3.0).
-   **Authentication:** Cloudflare Worker (`cf-auth`) with Google + GitHub OAuth and email/password.
-   **Database:** PostgreSQL (primary). Cloudflare D1 wired but unused (Phase 2).
-   **Object Storage:** Cloudflare R2 — published-app HTML mirrored at `sites/{appId}.html` and `sites/{appId}/v{n}.html` for versions. Read path prefers R2 with DB fallback (Phase 1 of off-Replit migration).
-   **DNS Management:** Cloudflare DNS API.
-   **Domain Registration:** name.com reseller API.
-   **Email Sending:** AWS SES.
-   **SMS:** Africa's Talking (live mode; awaiting production approval for non-sandbox numbers).
-   **Authentication (External Apps):** Firebase Auth.
-   **Frontend route guard:** `client/src/App.tsx` defines `AUTH_REQUIRED_EXACT` / `AUTH_REQUIRED_PREFIXES` (e.g. `/chat`, `/dashboard`, `/settings`, `/preview/:id`, `/dashboard/auth/...`). When `useAuth()` resolves to no user but the URL is in that set, `LoginRedirectGuard` saves the destination in `sessionStorage["after_login_redirect"]` and renders `<Redirect to="/login" />`. This prevents the previous "URL ends at /chat but the marketing homepage is shown" mobile bug, which happened when the worker session cookie was lost/dropped in transit and the catch-all silently rendered `LandingPage` for any unmatched path. The login page reads the same `after_login_redirect` key to bounce users back to the original destination after sign-in.
-   **Cloudflare Worker (auth):** `cloudflare/` package — Hono Worker deployed as `afro-ai-auth`, mounted at `afroaigroup.com/cf-auth/*` via Worker Route. Owns email/password signup/login/logout/me/forgot/reset and Google + GitHub OAuth. Backed by D1 (`e796b2ab-d062-42c2-8412-7d281e4c0f5d`) with users / oauth_accounts / password_reset_tokens. Bot protection via Cloudflare Turnstile (frontend uses test key `1x00000000000000000000AA` on non-prod hostnames so the widget renders during dev). Frontend pages `client/src/pages/{login,forgot-password,reset-password}.tsx` and `client/src/components/turnstile-widget.tsx` call the Worker. Express trusts the Worker's `afroai_session` cookie via `server/replit_integrations/auth/cfBridge.ts`, so the existing `isAuthenticated`/`isFounder` middleware keeps working unchanged. The legacy Passport email/password and Google/GitHub strategies have been retired; only the TikTok PKCE flow and `/api/logout` (which clears both Passport and Worker cookies) remain in `replitAuth.ts`.
-   **Afro Auth (multi-tenant Login-as-a-Service):** Same Worker (`cloudflare/src/index.ts`) hosts the customer-facing product on top of the same D1. Migration `cloudflare/migrations/001_multitenant.sql` added `tenants`, `api_keys`, `tenant_usage`, `tenant_user_activity` tables and rebuilt `users` with `tenant_id` (default `'platform'` for existing rows) + `UNIQUE(tenant_id, email)`. Tenant end-user APIs live under `/cf-auth/t/:slug/{signup,login,me}` (return JWT in body, no cookies; CORS enforces `tenants.allowed_origins` allowlist when set). Server-to-server APIs `/cf-auth/v1/sessions/verify` and `/cf-auth/v1/users` authenticate by `Authorization: Bearer sk_live_…` keys (secret stored as sha256 hex; revealed once on creation). Platform admin APIs `/cf-auth/v1/admin/tenants[/:id[/keys|users]]` use the existing `afroai_session` cookie. MAU is tracked per-tenant per-month in `tenant_user_activity`; signup is hard-capped per plan via `PLAN_MAU_LIMITS`. Customer-facing pages: `/afro-auth` (public landing), `/dashboard/auth` (project list), `/dashboard/auth/:id` (single project — quickstart, keys, users, settings). Sidebar entry "Afro Auth" points to `/dashboard/auth`. Pricing tiers: Free 5k / $5 Builder 25k / $25 Business 100k / $100 Scale 500k MAU.
## Vibe-Coding Upgrades (May 2026)
The AI chat (`/ai-chat`, `/agent`) now supports a structured marker syntax that the model can emit and the UI renders as rich, interactive components.

**Marker syntax** (drop in any assistant message):
- `[[file:path/to/file.ts:10-25]]` → renders a clickable FileChip; opens an inline CodeMirror-style viewer modal that shows the actual file snippet from the project (sandbox-restricted, blocks `.env`, `.git`, `.local`, `node_modules`).
- `[[step:read|search|edit|write|test|deploy|fix:Label]]` → adds an entry to a per-message Build Ledger timeline.
- `[[needs-secret:OPENAI_API_KEY:reason]]` → surfaces a "Required API Keys" card with green/red status (set vs missing).

**Backend (`server/vibe-routes.ts`)**:
- `GET /api/vibe/file?path=&start=&end=` — sandboxed file snippet
- `POST /api/vibe/scan-secrets` — scans code for `process.env.X` / `import.meta.env.X` / `Deno.env.get(...)` references and returns which are missing
- `POST /api/vibe/typecheck` — runs `tsc --noEmit` on a code snippet, returns errors
- `GET /api/vibe/steps/:messageId`, `GET /api/vibe/refs/:messageId`, `POST /api/vibe/index/:messageId` — persisted build ledger / file refs (tables `vibe_steps`, `vibe_file_refs`)
- `POST /api/vibe/rollback/:messageId` — returns the `app_versions` snapshot taken at-or-before that message so a single message can be rewound

**Frontend (`client/src/components/vibe-chips.tsx`)**:
- `parseVibeMarkers(text)` — pure parser, unit-tested in `client/src/__tests__/vibe-chips.test.ts`
- `<FileChip>`, `<BuildLedger>`, `<RequiredSecrets>`, `<TypecheckBadge>`, and the composite `<VibePanel>` which is wired into `ai-chat.tsx`'s `renderMessageContent`.
