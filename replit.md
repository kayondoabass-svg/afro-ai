# Afro AI

## Overview
Afro AI, a product of KEYO TECHNOLOGIES, is a global AI-powered platform enabling creators to build digital products like websites, web apps, games, tools, and dashboards. Originating from Africa, it caters to a worldwide market. Its core features include an AI co-creation assistant, multi-page application generation, comprehensive project management, and ZIP project export functionality. The platform's vision is to democratize digital creation and foster innovation globally.

## User Preferences
- Dark mode as default
- African-inspired color scheme (gold primary, warm tones)
- Pesapal for payments across Africa (Mobile Money, Visa, Mastercard, bank transfers)

## System Architecture
The platform is built on a modern web stack: React, TypeScript, Vite, Tailwind CSS, and shadcn/ui for the frontend; Express.js and Node.js for the backend; and PostgreSQL with Drizzle ORM for the database. Google OAuth 2.0 handles authentication. AI capabilities are powered by OpenAI, with tiered models aligning with user subscription plans.

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
-   **Chatbot API:** Enables users to create embeddable AI chatbots for external websites with a knowledge base and brand customization.

## External Dependencies
-   **AI Services:** OpenAI, Google Gemini.
-   **Payment Gateway:** Pesapal (API 3.0).
-   **Authentication:** Google OAuth 2.0.
-   **Database:** PostgreSQL (primary). Cloudflare D1 wired but unused (Phase 2).
-   **Object Storage:** Cloudflare R2 — published-app HTML mirrored at `sites/{appId}.html` and `sites/{appId}/v{n}.html` for versions. Read path prefers R2 with DB fallback (Phase 1 of off-Replit migration).
-   **DNS Management:** Cloudflare DNS API.
-   **Domain Registration:** name.com reseller API.
-   **Email Sending:** AWS SES.
-   **SMS:** Africa's Talking (live mode; awaiting production approval for non-sandbox numbers).
-   **Authentication (External Apps):** Firebase Auth.
-   **Cloudflare Worker (auth):** `cloudflare/` package — Hono Worker deployed as `afro-ai-auth`, mounted at `afroaigroup.com/cf-auth/*` via Worker Route. Owns email/password signup/login/logout/me/forgot/reset and Google + GitHub OAuth. Backed by D1 (`e796b2ab-d062-42c2-8412-7d281e4c0f5d`) with users / oauth_accounts / password_reset_tokens. Bot protection via Cloudflare Turnstile (frontend uses test key `1x00000000000000000000AA` on non-prod hostnames so the widget renders during dev). Frontend pages `client/src/pages/{login,forgot-password,reset-password}.tsx` and `client/src/components/turnstile-widget.tsx` call the Worker. Express OIDC (`server/replit_integrations/auth/replitAuth.ts`) is still live alongside it; full cutover is Phase 2.