import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Send,
  BarChart3,
  Store,
  Smartphone,
  Users,
  Globe,
  Zap,
  Search,
  Link2,
  Bot,
  HardDrive,
  PhoneCall,
  LayoutGrid,
  KeyRound,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

const ALL_MENU_ITEMS = [
  { title: "Overview", url: "/overview", icon: LayoutGrid },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "AI Builder", url: "/chat", icon: MessageSquare },
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
  { title: "Email API", url: "/email-api", icon: Send },
  { title: "Chatbot API", url: "/chatbots", icon: Bot },
  { title: "USSD Builder", url: "/ussd", icon: PhoneCall },
  { title: "My USSD Apps", url: "/ussd/apps", icon: Smartphone },
  { title: "Files & Storage", url: "/files", icon: HardDrive },
  { title: "Secrets", url: "/secrets", icon: KeyRound },
  { title: "Activity Logs", url: "/logs", icon: Activity },
  { title: "Console", url: "/console", icon: Terminal },
  { title: "Referrals", url: "/referrals", icon: Gift },
  { title: "Pricing", url: "/pricing", icon: CreditCard },
  { title: "Billing & Usage", url: "/billing", icon: Receipt },
  { title: "Settings", url: "/settings", icon: Settings },
];

const FOUNDER_ITEMS = [
  { title: "Founder Dashboard", url: "/founder", icon: Crown },
  { title: "Command Center", url: "/admin-command", icon: Terminal },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const firstName = user?.firstName || "Creator";
  const isFounder = (user as any)?.isFounder === true;

  const filteredItems = search.trim()
    ? ALL_MENU_ITEMS.filter(item =>
        item.title.toLowerCase().includes(search.toLowerCase())
      )
    : ALL_MENU_ITEMS;

  return (
    <Sidebar>
      <SidebarHeader className="p-4 pb-2">
        <Link href="/overview">
          <div className="flex items-center gap-2 cursor-pointer mb-3" data-testid="link-sidebar-logo">
            <img src={afroLogo} alt="Afro AI" className="w-8 h-8 object-contain" />
            <span className="font-bold text-lg tracking-tight">Afro AI</span>
          </div>
        </Link>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-sidebar-search"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{search ? `Results (${filteredItems.length})` : t("sidebar.menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">No matches found</p>
              ) : (
                filteredItems.map((item) => (
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
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isFounder && !search && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-primary">Founder</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {FOUNDER_ITEMS.map((item) => (
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
