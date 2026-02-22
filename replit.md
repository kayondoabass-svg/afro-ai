# Africa.ai

## Overview
Africa.ai is a platform that helps African creators build websites and mobile apps and launch them to the App Store and Google Play Store. It features an AI-powered chat assistant, project management, and a payment system (Flutterwave - coming soon).

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Google OAuth 2.0 (passport-google-oauth20)
- **AI**: OpenAI via Replit AI Integrations (tiered: nano/mini/4.1 by plan)
- **Payments**: Flutterwave (coming soon)
- **Routing**: wouter (frontend), Express (backend)

## Project Structure
- `client/src/pages/` - Landing, Dashboard, AI Chat, Pricing pages
- `client/src/components/` - AppSidebar, ThemeProvider, ThemeToggle, UI components
- `server/routes.ts` - API routes (projects CRUD, publishing)
- `server/storage.ts` - Database storage layer
- `server/cloudflare.ts` - Cloudflare DNS API service for subdomain management
- `server/db.ts` - Database connection
- `server/replit_integrations/` - Auth, Chat, Image integrations
- `shared/schema.ts` - Drizzle schemas (users, sessions, projects, conversations, messages, publishedApps)
- `shared/models/` - Auth and Chat model definitions

## Key Features
- Dark mode default with light mode toggle (African-inspired gold/amber theme)
- Landing page with African heritage imagery and slogans
- Dashboard with project management (create, view, delete)
- AI-powered code generator with live preview (split-view: chat + iframe)
- Tiered AI models by plan: Starter=gpt-4.1-nano, Pro=gpt-4.1-mini, Business=gpt-4.1
- App publishing to custom subdomains (e.g., my-app.afroaigroup.com) via Cloudflare DNS API
- Pricing page with Flutterwave integration (coming soon)
- Responsive design with sidebar navigation

## App Publishing (Subdomains)
- Users can publish AI-generated apps to `subdomain.afroaigroup.com`
- Cloudflare DNS API creates CNAME records for each subdomain
- Published apps stored in `published_apps` table (htmlContent, subdomain, title)
- Subdomain validation: 3-50 chars, lowercase alphanumeric + hyphens, reserved words blocked
- Preview route: `/site/:subdomain` serves published HTML directly
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
- `POST /api/conversations/:id/messages` - Send message (streaming SSE)
- `DELETE /api/conversations/:id` - Delete conversation
- `GET /api/published-apps` - Get user's published apps (auth required)
- `POST /api/publish` - Publish app to subdomain (auth required, body: subdomain, htmlContent, title)
- `DELETE /api/published-apps/:id` - Delete published app and DNS record (auth required)
- `GET /api/check-subdomain/:subdomain` - Check if subdomain is available
- `GET /site/:subdomain` - Serve published app HTML
- Auth routes: `/api/login`, `/api/logout`, `/api/auth/user`, `/api/callback`

## User Preferences
- Dark mode as default
- African-inspired color scheme (gold primary, warm tones)
- Flutterwave for payments in Uganda
- Payments section marked as "Coming Soon" for now
- FLW_SECRET_KEY, FLW_PUBLIC_KEY, FLW_SECRET_HASH needed when ready

## Environment Variables
- DATABASE_URL - PostgreSQL connection
- SESSION_SECRET - Session encryption
- AI_INTEGRATIONS_OPENAI_API_KEY - AI access (auto-configured)
- AI_INTEGRATIONS_OPENAI_BASE_URL - AI endpoint (auto-configured)
- CLOUDFLARE_API_TOKEN - Cloudflare API token for DNS management
- CLOUDFLARE_ZONE_ID - Cloudflare zone ID for afroaigroup.com
