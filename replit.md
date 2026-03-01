# Afro AI

## Overview
Afro AI is a product of KEYO TECHNOLOGIES (Registration No. 80030812159711), a registered business in Kampala, Uganda. It is a global AI-powered platform — born in Africa, built for the world — that helps creators build websites, web apps, games, tools, dashboards, and any digital product. It serves all 54 African countries plus the Americas, Europe, Asia, and beyond. Features include an AI-powered co-creation assistant, multi-page app generation, project management, ZIP project export, and a payment system (Pesapal).

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Google OAuth 2.0 (passport-google-oauth20)
- **AI**: OpenAI via Replit AI Integrations (tiered: nano/mini/4.1 by plan)
- **Payments**: Pesapal (Mobile Money, Visa, Mastercard, bank transfers)
- **Routing**: wouter (frontend), Express (backend)

## Project Structure
- `client/src/pages/` - Landing, Dashboard, AI Chat, Deployments, Pricing, Referrals, Templates, Settings, Founder Dashboard, Admin Command, About, Contact, Privacy, Terms, Cookies pages
- `client/src/components/` - AppSidebar, ThemeProvider, ThemeToggle, UI components
- `server/routes.ts` - API routes (projects CRUD, publishing)
- `server/storage.ts` - Database storage layer
- `server/cloudflare.ts` - Cloudflare DNS API service for subdomain management
- `server/pesapal.ts` - Pesapal payment gateway integration (API 3.0)
- `server/db.ts` - Database connection
- `server/gemini.ts` - Google Gemini AI image analysis service
- `server/replit_integrations/` - Auth, Chat, Image integrations
- `shared/schema.ts` - Drizzle schemas (users, sessions, projects, conversations, messages, publishedApps)
- `shared/models/` - Auth and Chat model definitions
- `shared/currencies.ts` - All 54 African countries with currency codes, symbols, and exchange rates

## Key Features
- Dark mode default with light mode toggle (African-inspired gold/amber theme)
- Landing page with African heritage imagery, "How It Works" steps, testimonials, animated gradient text
- Dashboard with project management (create, view, delete) and quick-start ideas for new users
- AI-powered code generator with live preview (split-view: chat + iframe)
- AI Content Creation Mode: smart emails, proposals, documents with user context (name, email, business) auto-filled — no placeholders
- Image scanning/recognition via Google Gemini (ScanSearch button in AI chat)
- Project continuity: conversations linked to projects via projectId, "Open & Build" resumes last conversation
- File attachments in AI chat (photos, videos, screenshots) with OpenAI vision support
- Tiered AI models by plan: Starter=gpt-4.1-nano, Pro=gpt-4.1-mini, Business=gpt-4.1
- App publishing to {name}.afroaigroup.com via Cloudflare DNS + Express subdomain routing
- Deployments page: detailed view of all published apps with URL, visibility, status, copy/delete
- Pricing page with Pesapal payment integration
- Templates page: 21 pre-built African business templates across 5 categories (Business, E-Commerce, Portfolio, Community, Events) with one-click "Use Template" to start building
- Settings page: profile display, plan badge, country/currency preference selector, account stats
- AI co-creation with 30/70 rule: AI asks clarifying questions first, then builds with predictive UX (auto-suggests M-Pesa, WhatsApp, local currencies)
- Context-aware AI: on follow-up requests, the AI receives the last generated HTML as "CURRENT APP STATE" in its system prompt, so it modifies the existing code surgically instead of rebuilding from scratch
- Performance-first code generation: lazy loading, <500KB pages, optimized for 2G/3G African networks
- Dashboard shows live published sites, plan badge, and published apps count
- Responsive design with sidebar navigation

## App Publishing
- Users can publish AI-generated apps to `{name}.afroaigroup.com` (unique subdomain per app)
- Published apps stored in `published_apps` table (htmlContent, subdomain, title, appStatus, suspendedAt, suspendReason)
- Name validation: 3-50 chars, lowercase alphanumeric + hyphens, reserved words blocked
- Subdomain middleware detects `*.afroaigroup.com` requests via Host header and serves published HTML
- Fallback route: `/site/:subdomain` also serves published apps (path-based access)
- Publish dialog loads user's existing app from server API (per-user, no localStorage)
- Users can update or delete their published apps (delete includes Cloudflare DNS cleanup)
- Auto-test & auto-publish: after AI generates code, automated quality checks run (HTML structure, content, broken images); if checks pass and user has existing app, auto-republishes to their subdomain

## App Suspension System
- Published apps have `appStatus` field: "active" (default) or "suspended"
- Suspended apps show a branded "Site Suspended" page with reason instead of app content
- Founder can suspend/reactivate individual apps from Founder Dashboard (Ban/CheckCircle buttons)
- Founder can suspend/reactivate all apps for a specific user via admin API
- When a user pays (Pesapal IPN), their suspended apps are automatically reactivated
- Admin API routes:
  - `POST /api/admin/published-apps/:id/suspend` - Suspend single app (body: reason)
  - `POST /api/admin/published-apps/:id/reactivate` - Reactivate single app
  - `POST /api/admin/users/:userId/suspend-apps` - Suspend all user's apps
  - `POST /api/admin/users/:userId/reactivate-apps` - Reactivate all user's apps
- Deployments page shows red "Suspended" status with reason in expanded details
- Dashboard Live Sites shows red icon for suspended apps

## AI Model Tiers
- **Starter (Free)**: gpt-4.1-nano, 16k max tokens - basic code generation
- **Pro ($9/mo)**: gpt-4.1-mini, 32k max tokens - better quality designs
- **Business ($29/mo)**: gpt-4.1, 32k max tokens - premium quality output
- User plan stored in `users.plan` column (default: "starter")
- Model selection happens server-side in chat/routes.ts based on DB lookup

## API Routes
- `GET /api/projects` - Get user's projects (auth required)
- `POST /api/projects` - Create project (auth required)
- `DELETE /api/projects/:id` - Delete project (auth required)
- `GET /api/conversations` - Get all conversations
- `POST /api/conversations` - Create conversation
- `POST /api/conversations/:id/messages` - Send message with optional attachments (streaming SSE, vision support)
- `DELETE /api/conversations/:id` - Delete conversation
- `POST /api/upload` - Upload files (images/videos, max 10MB, auth required)
- `POST /api/analyze-image` - Analyze image with Google Gemini AI (auth required, body: imageBase64, mimeType, prompt)
- `GET /api/published-apps` - Get user's published apps (auth required)
- `POST /api/publish` - Publish app to subdomain (auth required, body: subdomain, htmlContent, title)
- `DELETE /api/published-apps/:id` - Delete published app and DNS record (auth required)
- `GET /api/check-subdomain/:subdomain` - Check if subdomain is available
- `GET /site/:subdomain` - Serve published app HTML
- `GET /api/referral` - Get user's referral code, link, stats, and referral list (auth required)
- `POST /api/subscribe` - Create Pesapal payment order, returns redirect URL (auth required)
- `GET /api/pesapal/ipn` - Pesapal IPN callback (processes payment, upgrades plan)
- `GET /api/pesapal/callback` - User redirect after payment completion
- Auth routes: `/api/login`, `/api/logout`, `/api/auth/user`, `/api/callback`

## User Preferences
- Dark mode as default
- African-inspired color scheme (gold primary, warm tones)
- Pesapal for payments across Africa (Mobile Money, Visa, Mastercard, bank transfers)
- PESAPAL_CONSUMER_KEY, PESAPAL_CONSUMER_SECRET needed for payment processing

## Founder / Admin System
- Founder email: kayondoabass@gmail.com (hardcoded in server for security)
- `isFounder` middleware: checks email match, returns 403 for non-founders
- `/api/auth/user` response includes `isFounder: boolean` field
- Founder Dashboard (`/founder`): Full platform analytics - all users, projects, published apps, conversations, messages
- Admin Command Center (`/admin-command`): AI chat interface where founder can type natural language instructions to build/modify pages and publish directly to afroaigroup.com
- Admin API routes: `/api/admin/stats`, `/api/admin/users`, `/api/admin/projects`, `/api/admin/published-apps` (all protected by isFounder middleware)
- Sidebar shows "Founder" section with Crown icon only when isFounder is true

## Referral Commission System
- Users get a unique 8-character referral code (auto-generated on first access)
- Referral link format: `https://afroaigroup.com?ref=CODE`
- Landing page captures `?ref=` param and passes it to `/api/login?ref=CODE`
- On Google OAuth callback, ref code is stored in session, then used to create referral record
- 5% commission when referred user upgrades to paid plan
- Commission credited towards referrer's Afro AI plan subscription
- Self-referral prevention: checked in both auth callback and storage layer
- Duplicate prevention: unique index on referrals.referred_id
- DB tables: `referrals` (id, referrer_id, referred_id, status, commission_amount, paid_plan, created_at)
- User fields: referral_code (unique), referred_by, referral_credit (cents)
- Referrals page (`/referrals`): Shows referral link, stats (total/paid/earnings/credit), how-it-works, referral list

## Environment Variables
- DATABASE_URL - PostgreSQL connection
- SESSION_SECRET - Session encryption
- AI_INTEGRATIONS_OPENAI_API_KEY - AI access (auto-configured)
- AI_INTEGRATIONS_OPENAI_BASE_URL - AI endpoint (auto-configured)
- CLOUDFLARE_API_TOKEN - Cloudflare API token for DNS management
- CLOUDFLARE_ZONE_ID - Cloudflare zone ID for afroaigroup.com
- PESAPAL_CONSUMER_KEY - Pesapal merchant consumer key
- PESAPAL_CONSUMER_SECRET - Pesapal merchant consumer secret
- PESAPAL_ENV - "production" or "sandbox" (defaults to sandbox)
