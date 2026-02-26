# Afro AI

## Overview
Afro AI is a product of KEYO TECHNOLOGIES (Registration No. 80030812159711), a registered business in Kampala, Uganda. It is a platform that helps African creators build websites and mobile apps and launch them to the App Store and Google Play Store. It features an AI-powered chat assistant, project management, and a payment system (Pesapal).

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Google OAuth 2.0 (passport-google-oauth20)
- **AI**: OpenAI via Replit AI Integrations (tiered: nano/mini/4.1 by plan)
- **Payments**: Pesapal (Mobile Money, Visa, Mastercard, bank transfers)
- **Routing**: wouter (frontend), Express (backend)

## Project Structure
- `client/src/pages/` - Landing, Dashboard, AI Chat, Deployments, Pricing, Referrals, Founder Dashboard, Admin Command, About, Contact, Privacy, Terms, Cookies pages
- `client/src/components/` - AppSidebar, ThemeProvider, ThemeToggle, UI components
- `server/routes.ts` - API routes (projects CRUD, publishing)
- `server/storage.ts` - Database storage layer
- `server/cloudflare.ts` - Cloudflare DNS API service for subdomain management
- `server/pesapal.ts` - Pesapal payment gateway integration (API 3.0)
- `server/db.ts` - Database connection
- `server/replit_integrations/` - Auth, Chat, Image integrations
- `shared/schema.ts` - Drizzle schemas (users, sessions, projects, conversations, messages, publishedApps)
- `shared/models/` - Auth and Chat model definitions
- `shared/currencies.ts` - All 54 African countries with currency codes, symbols, and exchange rates

## Key Features
- Dark mode default with light mode toggle (African-inspired gold/amber theme)
- Landing page with African heritage imagery and slogans
- Dashboard with project management (create, view, delete)
- AI-powered code generator with live preview (split-view: chat + iframe)
- Project continuity: conversations linked to projects via projectId, "Open & Build" resumes last conversation
- File attachments in AI chat (photos, videos, screenshots) with OpenAI vision support
- Tiered AI models by plan: Starter=gpt-4.1-nano, Pro=gpt-4.1-mini, Business=gpt-4.1
- App publishing to {name}.afroaigroup.com via Cloudflare DNS + Express subdomain routing
- Deployments page: detailed view of all published apps with URL, visibility, status, copy/delete
- Pricing page with Pesapal payment integration
- Responsive design with sidebar navigation

## App Publishing
- Users can publish AI-generated apps to `{name}.afroaigroup.com` (unique subdomain per app)
- Published apps stored in `published_apps` table (htmlContent, subdomain, title)
- Name validation: 3-50 chars, lowercase alphanumeric + hyphens, reserved words blocked
- Subdomain middleware detects `*.afroaigroup.com` requests via Host header and serves published HTML
- Fallback route: `/site/:subdomain` also serves published apps (path-based access)
- Publish dialog loads user's existing app from server API (per-user, no localStorage)
- Users can update or delete their published apps

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
