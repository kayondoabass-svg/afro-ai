import { Switch, Route, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageProvider } from "@/hooks/use-language";
import { LanguageSelector } from "@/components/language-selector";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";

const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const AIChatPage = lazy(() => import("@/pages/ai-chat"));
const AgentPage = lazy(() => import("@/pages/agent"));
const PreviewPage = lazy(() => import("@/pages/preview"));
const PricingPage = lazy(() => import("@/pages/pricing"));
const DeploymentsPage = lazy(() => import("@/pages/deployments"));
const FounderDashboardPage = lazy(() => import("@/pages/founder-dashboard"));
const AdminCommandPage = lazy(() => import("@/pages/admin-command"));
const TeamManagementPage = lazy(() => import("@/pages/team-management"));
const ReferralsPage = lazy(() => import("@/pages/referrals"));
const AboutPage = lazy(() => import("@/pages/about"));
const ContactPage = lazy(() => import("@/pages/contact"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const TermsPage = lazy(() => import("@/pages/terms"));
const CookiePolicyPage = lazy(() => import("@/pages/cookies"));
const RefundPolicyPage = lazy(() => import("@/pages/refund-policy"));
const TemplatesPage = lazy(() => import("@/pages/templates"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const BillingPage = lazy(() => import("@/pages/billing"));
const FormsPage = lazy(() => import("@/pages/forms"));
const BlockBuilderPage = lazy(() => import("@/pages/block-builder"));
const BlogPage = lazy(() => import("@/pages/blog"));
const EmailMarketingPage = lazy(() => import("@/pages/email-marketing"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const MarketplacePage = lazy(() => import("@/pages/marketplace"));
const PwaBuilderPage = lazy(() => import("@/pages/pwa-builder"));
const CollaborationPage = lazy(() => import("@/pages/collaboration"));
const DomainsPage = lazy(() => import("@/pages/domains"));
const AffiliatePage = lazy(() => import("@/pages/affiliate"));
const ApiIntegrationsPage = lazy(() => import("@/pages/api-integrations"));
const SeoToolsPage = lazy(() => import("@/pages/seo-tools"));
const WebhooksPage = lazy(() => import("@/pages/webhooks"));
const ChatbotsPage = lazy(() => import("@/pages/chatbots"));
const ChatbotLandingPage = lazy(() => import("@/pages/chatbot-landing"));
const ChatbotCheckoutPage = lazy(() => import("@/pages/chatbot-checkout"));
const ArticlesPage = lazy(() => import("@/pages/articles"));
const ArticlePage = lazy(() => import("@/pages/article"));
const FilesPage = lazy(() => import("@/pages/files"));
const UssdBuilderPage = lazy(() => import("@/pages/ussd-builder"));
const UssdDashboardPage = lazy(() => import("@/pages/ussd-dashboard"));
const PlaygroundPage = lazy(() => import("@/pages/playground"));
const OverviewPage = lazy(() => import("@/pages/overview"));
const AppSecretsPage = lazy(() => import("@/pages/app-secrets"));
const D1ConsolePage = lazy(() => import("@/pages/d1-console"));
const ActivityLogsPage = lazy(() => import("@/pages/activity-logs"));
const ConsolePage = lazy(() => import("@/pages/console"));
const ShellPage = lazy(() => import("@/pages/shell"));
const EmailApiPage = lazy(() => import("@/pages/email-api"));
const EmailApiLandingPage = lazy(() => import("@/pages/email-api-landing"));
const EmailAuditPage = lazy(() => import("@/pages/email-audit"));
const EmailApiDocsPage = lazy(() => import("@/pages/docs-email-api"));
const UssdLandingPage = lazy(() => import("@/pages/ussd-landing"));
const PartnersPage = lazy(() => import("@/pages/partners"));
const BusinessServicesPage = lazy(() => import("@/pages/business-services"));
const DomainsLandingPage = lazy(() => import("@/pages/domains-landing"));
const DomainsCheckoutPage = lazy(() => import("@/pages/domains-checkout"));
const WebsiteBuilderLandingPage = lazy(() => import("@/pages/website-builder-landing"));
const AppDesignerLandingPage = lazy(() => import("@/pages/app-designer-landing"));

function RouteFallback() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="space-y-4 text-center">
        <Skeleton className="w-12 h-12 rounded-full mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-[100dvh] w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <LanguageSelector compact />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 flex flex-col overflow-y-auto min-h-0">
            <Suspense fallback={<RouteFallback />}>
              <Switch>
                <Route path="/dashboard" component={DashboardPage} />
                <Route path="/chat" component={AgentPage} />
                <Route path="/agent" component={AgentPage} />
                <Route path="/preview/:id" component={PreviewPage} />
                <Route path="/chat-classic" component={AIChatPage} />
                <Route path="/deployments" component={DeploymentsPage} />
                <Route path="/pricing" component={PricingPage} />
                <Route path="/founder" component={FounderDashboardPage} />
                <Route path="/team" component={TeamManagementPage} />
                <Route path="/admin-command" component={AdminCommandPage} />
                <Route path="/referrals" component={ReferralsPage} />
                <Route path="/templates" component={TemplatesPage} />
                <Route path="/settings" component={SettingsPage} />
                <Route path="/billing" component={BillingPage} />
                <Route path="/forms" component={FormsPage} />
                <Route path="/builder" component={BlockBuilderPage} />
                <Route path="/blog" component={BlogPage} />
                <Route path="/email" component={EmailMarketingPage} />
                <Route path="/analytics" component={AnalyticsPage} />
                <Route path="/marketplace" component={MarketplacePage} />
                <Route path="/pwa" component={PwaBuilderPage} />
                <Route path="/collaborate" component={CollaborationPage} />
                <Route path="/domains" component={DomainsPage} />
                <Route path="/affiliate" component={AffiliatePage} />
                <Route path="/integrations" component={ApiIntegrationsPage} />
                <Route path="/seo" component={SeoToolsPage} />
                <Route path="/webhooks" component={WebhooksPage} />
                <Route path="/chatbots" component={ChatbotsPage} />
                <Route path="/files" component={FilesPage} />
                <Route path="/ussd" component={UssdBuilderPage} />
                <Route path="/ussd/apps" component={UssdDashboardPage} />
                <Route path="/playground" component={PlaygroundPage} />
                <Route path="/overview" component={OverviewPage} />
                <Route path="/secrets" component={AppSecretsPage} />
                <Route path="/d1" component={D1ConsolePage} />
                <Route path="/logs" component={ActivityLogsPage} />
                <Route path="/console" component={ConsolePage} />
                <Route path="/shell" component={ShellPage} />
                <Route path="/email-api" component={EmailApiPage} />
                <Route path="/email-audit" component={EmailAuditPage} />
                <Route path="/partners" component={PartnersPage} />
                <Route path="/business-services" component={BusinessServicesPage} />
                <Route path="/website-builder" component={WebsiteBuilderLandingPage} />
                <Route path="/app-designer" component={AppDesignerLandingPage} />
                <Route path="/domain-names/checkout" component={DomainsCheckoutPage} />
                <Route path="/domain-names" component={DomainsLandingPage} />
                <Route path="/chatbot-api" component={ChatbotLandingPage} />
                <Route path="/chatbot-checkout" component={ChatbotCheckoutPage} />
                <Route path="/articles/:slug" component={ArticlePage} />
                <Route path="/articles" component={ArticlesPage} />
                <Route path="/about" component={AboutPage} />
                <Route path="/contact" component={ContactPage} />
                <Route path="/privacy" component={PrivacyPage} />
                <Route path="/terms" component={TermsPage} />
                <Route path="/cookies" component={CookiePolicyPage} />
                <Route path="/refund-policy" component={RefundPolicyPage} />
                <Route path="/" component={DashboardPage} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Afro AI — Build Websites & Apps with AI | No Coding Needed",
  "/login": "Sign In — Afro AI",
  "/pricing": "Pricing Plans — Afro AI | Free, Pro & Business",
  "/templates": "Templates — Afro AI | 21 African Business Templates",
  "/marketplace": "Marketplace — Afro AI | Community Templates & Components",
  "/blog": "Blog — Afro AI | African Tech News & Tutorials",
  "/about": "About — Afro AI | Built by KEYO TECHNOLOGIES",
  "/contact": "Contact — Afro AI",
  "/affiliate": "Affiliate Program — Afro AI | Earn 20% Recurring Commission",
  "/domains": "Domain Store — Afro AI | .africa, .co.ug, .co.ke Domains",
  "/privacy": "Privacy Policy — Afro AI",
  "/terms": "Terms of Service — Afro AI",
  "/cookies": "Cookie Policy — Afro AI",
  "/refund-policy": "Refund Policy — Afro AI",
  "/dashboard": "Dashboard — Afro AI",
  "/chat": "AI Builder — Afro AI",
  "/deployments": "Deployments — Afro AI",
  "/settings": "Settings — Afro AI",
  "/billing": "Billing — Afro AI",
  "/forms": "Form Builder — Afro AI",
  "/analytics": "Analytics — Afro AI",
  "/pwa": "PWA Builder — Afro AI",
  "/collaborate": "Collaboration — Afro AI",
  "/ussd": "USSD Builder — Afro AI",
  "/seo": "SEO Tools — Afro AI",
  "/chatbot-api": "Chatbot API — Afro AI",
  "/developer-email": "Email API — Afro AI | Send Transactional Emails from Your App",
  "/docs/email-api": "Email API Setup Guide — Afro AI | Send Emails From Your Website",
  "/ussd-builder": "USSD Builder — Afro AI | Build USSD Apps for African Mobile Networks",
  "/domain-names": "Domain Names — Afro AI | .africa, .co.ke, .ng, .co.za & More",
  "/articles": "Articles — Afro AI",
};

function PageTitleUpdater() {
  const [location] = useLocation();
  useEffect(() => {
    const title = PAGE_TITLES[location] || "Afro AI — AI Website & App Builder";
    document.title = title;
    const descMeta = document.querySelector('meta[name="description"]');
    if (location === "/pricing" && descMeta) {
      descMeta.setAttribute("content", "Afro AI pricing plans: Free (1 app), Pro $15/mo, Business $29.90/mo. Pay with mobile money. No credit card needed to start.");
    } else if (location === "/templates" && descMeta) {
      descMeta.setAttribute("content", "21 ready-to-use African business templates. Build and launch your website or app in minutes with Afro AI.");
    } else if (location === "/marketplace" && descMeta) {
      descMeta.setAttribute("content", "Browse and sell templates, components and tools on the Afro AI community marketplace.");
    } else if (location === "/domains" && descMeta) {
      descMeta.setAttribute("content", "Register African domain names: .africa, .co.ug, .co.ke, .co.tz and more directly from your Afro AI dashboard.");
    }
  }, [location]);
  return null;
}

function AppRouter() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  // After login, redirect back to chatbot checkout if a plan was pending
  useEffect(() => {
    if (user) {
      const pendingPlan = localStorage.getItem("chatbot_checkout_plan");
      const pendingBilling = localStorage.getItem("chatbot_checkout_billing") || "monthly";
      if (pendingPlan) {
        localStorage.removeItem("chatbot_checkout_plan");
        localStorage.removeItem("chatbot_checkout_billing");
        navigate(`/chatbot-checkout?plan=${pendingPlan}&billing=${pendingBilling}`);
      }
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="w-16 h-16 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/forgot-password" component={ForgotPasswordPage} />
          <Route path="/reset-password" component={ResetPasswordPage} />
          <Route path="/about" component={AboutPage} />
          <Route path="/contact" component={ContactPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/terms" component={TermsPage} />
          <Route path="/cookies" component={CookiePolicyPage} />
          <Route path="/refund-policy" component={RefundPolicyPage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/templates" component={TemplatesPage} />
          <Route path="/marketplace" component={MarketplacePage} />
          <Route path="/blog" component={BlogPage} />
          <Route path="/affiliate" component={AffiliatePage} />
          <Route path="/chatbot-api" component={ChatbotLandingPage} />
          <Route path="/chatbot-checkout" component={ChatbotCheckoutPage} />
          <Route path="/developer-email" component={EmailApiLandingPage} />
          <Route path="/docs/email-api" component={EmailApiDocsPage} />
          <Route path="/ussd-builder" component={UssdLandingPage} />
          <Route path="/partners" component={PartnersPage} />
          <Route path="/business-services" component={BusinessServicesPage} />
          <Route path="/website-builder" component={WebsiteBuilderLandingPage} />
          <Route path="/app-designer" component={AppDesignerLandingPage} />
          <Route path="/domain-names/checkout" component={DomainsCheckoutPage} />
          <Route path="/domain-names" component={DomainsLandingPage} />
          <Route path="/articles/:slug" component={ArticlePage} />
          <Route path="/articles" component={ArticlesPage} />
          <Route component={LandingPage} />
        </Switch>
      </Suspense>
    );
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <PageTitleUpdater />
            <AppRouter />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
