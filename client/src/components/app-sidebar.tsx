import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  MessageSquare,
  CreditCard,
  LogOut,
  Crown,
  Terminal,
  Rocket,
  Gift,
  LayoutTemplate,
  Settings,
  Receipt,
  ClipboardList,
  Layers,
  BookOpen,
  Mail,
  BarChart3,
  Store,
  Smartphone,
  Users,
  Globe,
  Zap,
  Search,
  Link2,
  Bot,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const firstName = user?.firstName || "Creator";

  const isFounder = (user as any)?.isFounder === true;

  const menuItems = [
    { title: t("sidebar.dashboard"), url: "/dashboard", icon: LayoutDashboard },
    { title: t("sidebar.aiChat"), url: "/chat", icon: MessageSquare },
    { title: "Block Builder", url: "/builder", icon: Layers },
    { title: "Templates", url: "/templates", icon: LayoutTemplate },
    { title: "Deployments", url: "/deployments", icon: Rocket },
    { title: "Forms", url: "/forms", icon: ClipboardList },
    { title: "Blog & CMS", url: "/blog", icon: BookOpen },
    { title: "Email Marketing", url: "/email", icon: Mail },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Marketplace", url: "/marketplace", icon: Store },
    { title: "PWA Builder", url: "/pwa", icon: Smartphone },
    { title: "Collaborate", url: "/collaborate", icon: Users },
    { title: "Domain Store", url: "/domains", icon: Globe },
    { title: "API Integrations", url: "/integrations", icon: Link2 },
    { title: "SEO Tools", url: "/seo", icon: Search },
    { title: "Webhooks", url: "/webhooks", icon: Zap },
    { title: "Chatbot API", url: "/chatbots", icon: Bot },
    { title: "Referrals", url: "/referrals", icon: Gift },
    { title: t("sidebar.pricing"), url: "/pricing", icon: CreditCard },
    { title: "Billing & Usage", url: "/billing", icon: Receipt },
    { title: "Settings", url: "/settings", icon: Settings },
  ];

  const founderItems = [
    { title: "Founder Dashboard", url: "/founder", icon: Crown },
    { title: "Command Center", url: "/admin-command", icon: Terminal },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/dashboard">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-sidebar-logo">
            <img src={afroLogo} alt="Afro AI" className="w-8 h-8 object-contain" />
            <span className="font-bold text-lg tracking-tight">Afro AI</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-sidebar-${item.url.slice(1)}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isFounder && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-primary">Founder</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {founderItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                    >
                      <Link href={item.url} data-testid={`link-sidebar-${item.url.slice(1)}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src={user?.profileImageUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {firstName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate" data-testid="text-sidebar-user">{firstName} {user?.lastName || ""}</p>
              <Badge variant={((user as any)?.plan || "starter") === "starter" ? "secondary" : "default"} className="capitalize text-[10px] px-1.5 py-0" data-testid="badge-sidebar-plan">
                {(user as any)?.plan || "starter"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => logout()}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          {t("sidebar.logout")}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
