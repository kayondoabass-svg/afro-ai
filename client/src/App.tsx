import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
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
import DashboardPage from "@/pages/dashboard";
import AIChatPage from "@/pages/ai-chat";
import AgentPage from "@/pages/agent";
import PricingPage from "@/pages/pricing";
import DeploymentsPage from "@/pages/deployments";
import FounderDashboardPage from "@/pages/founder-dashboard";
import AdminCommandPage from "@/pages/admin-command";
import ReferralsPage from "@/pages/referrals";
import AboutPage from "@/pages/about";
import ContactPage from "@/pages/contact";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import CookiePolicyPage from "@/pages/cookies";
import RefundPolicyPage from "@/pages/refund-policy";
import TemplatesPage from "@/pages/templates";
import SettingsPage from "@/pages/settings";
import BillingPage from "@/pages/billing";
import FormsPage from "@/pages/forms";
import BlockBuilderPage from "@/pages/block-builder";
import BlogPage from "@/pages/blog";
import EmailMarketingPage from "@/pages/email-marketing";
import AnalyticsPage from "@/pages/analytics";
import MarketplacePage from "@/pages/marketplace";
import PwaBuilderPage from "@/pages/pwa-builder";
import CollaborationPage from "@/pages/collaboration";
import DomainsPage from "@/pages/domains";
import AffiliatePage from "@/pages/affiliate";
import ApiIntegrationsPage from "@/pages/api-integrations";
import SeoToolsPage from "@/pages/seo-tools";
import WebhooksPage from "@/pages/webhooks";
import ChatbotsPage from "@/pages/chatbots";
import ChatbotLandingPage from "@/pages/chatbot-landing";
import ChatbotCheckoutPage from "@/pages/chatbot-checkout";
import ArticlesPage from "@/pages/articles";
import ArticlePage from "@/pages/article";
import FilesPage from "@/pages/files";
import UssdBuilderPage from "@/pages/ussd-builder";
import UssdDashboardPage from "@/pages/ussd-dashboard";
import OverviewPage from "@/pages/overview";
import AppSecretsPage from "@/pages/app-secrets";
import D1ConsolePage from "@/pages/d1-console";
import ActivityLogsPage from "@/pages/activity-logs";
import ConsolePage from "@/pages/console";
import ShellPage from "@/pages/shell";
import EmailApiPage from "@/pages/email-api";
import EmailApiLandingPage from "@/pages/email-api-landing";
import EmailAuditPage from "@/pages/email-audit";
import EmailApiDocsPage from "@/pages/docs-email-api";
import UssdLandingPage from "@/pages/ussd-landing";
import PartnersPage from "@/pages/partners";
import DomainsLandingPage from "@/pages/domains-landing";
import NotFound from "@/pages/not-found";

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
            <Switch>
              <Route path="/dashboard" component={DashboardPage} />
              <Route path="/chat" component={AgentPage} />
              <Route path="/agent" component={AgentPage} />
              <Route path="/chat-classic" component={AIChatPage} />
              <Route path="/deployments" component={DeploymentsPage} />
              <Route path="/pricing" component={PricingPage} />
              <Route path="/founder" component={FounderDashboardPage} />
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
              <Route path="/overview" component={OverviewPage} />
              <Route path="/secrets" component={AppSecretsPage} />
              <Route path="/d1" component={D1ConsolePage} />
              <Route path="/logs" component={ActivityLogsPage} />
              <Route path="/console" component={ConsolePage} />
              <Route path="/shell" component={ShellPage} />
              <Route path="/email-api" component={EmailApiPage} />
              <Route path="/email-audit" component={EmailAuditPage} />
              <Route path="/partners" component={PartnersPage} />
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
      <Switch>
        <Route path="/login" component={LoginPage} />
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
        <Route path="/domain-names" component={DomainsLandingPage} />
        <Route path="/articles/:slug" component={ArticlePage} />
        <Route path="/articles" component={ArticlesPage} />
        <Route component={LandingPage} />
      </Switch>
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
