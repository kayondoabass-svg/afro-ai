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
-   **Tiered AI Models:** Different AI models (gpt-4.1-nano, gpt-4.1-mini, gpt-4.1) are offered based on user subscription plans.
-   **Security:** Implements global security headers, content security policies for published apps, HTML content scanning to detect malicious patterns, and API rate limiting.
-   **Referral System:** Includes a referral program with unique codes and commission tracking for plan upgrades.
-   **Billing & Usage Tracking:** Integrates Pesapal for payments, tracks AI usage (tokens, generations), and provides detailed billing information and payment history.
-   **Admin/Founder System:** A dedicated interface for founders/administrators to manage users, projects, published apps, and access analytics, including an AI chat for administrative commands.

## External Dependencies
-   **AI Services:** OpenAI (via Replit AI Integrations), Google Gemini (for image analysis).
-   **Payment Gateway:** Pesapal (API 3.0) for mobile money, Visa, Mastercard, and bank transfers.
-   **Authentication:** Google OAuth 2.0 (passport-google-oauth20).
-   **Database:** PostgreSQL.
-   **DNS Management:** Cloudflare DNS API.