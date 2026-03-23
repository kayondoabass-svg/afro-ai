import { Switch, Route } from "wouter";
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
import NotFound from "@/pages/not-found";

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <LanguageSelector compact />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 flex flex-col overflow-hidden">
            <Switch>
              <Route path="/dashboard" component={DashboardPage} />
              <Route path="/chat" component={AIChatPage} />
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

function AppRouter() {
  const { user, isLoading } = useAuth();

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
            <AppRouter />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
