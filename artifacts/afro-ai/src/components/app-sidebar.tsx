import { useEffect, useState } from "react";
import { useLocation, useSearch, Link } from "wouter";
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  MessageSquare,
  CreditCard,
  LogOut,
  Crown,
  Brain,
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
  KeyRound,
  Activity,
  DatabaseZap,
  SquareTerminal,
  Play,
  Handshake,
  Images,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import afroLogo from "@assets/IMG_5719_1771852498362.png";
import { requestNewChat } from "@/lib/chat-entry";

export const ALL_MENU_ITEMS = [
  { titleKey: "sidebar.keyoStudio", title: "KEYO Studio", url: "/keyo-studio", icon: Terminal },
  { titleKey: "sidebar.newChat", title: "New Chat", url: "/chat", icon: MessageSquare },
  { titleKey: "sidebar.dashboard", title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { titleKey: "sidebar.imagesVideos", title: "Images & Videos", url: "/media", icon: Images },
  { titleKey: "sidebar.playground", title: "Run Code", url: "/playground", icon: Play },
  { titleKey: "sidebar.blockBuilder", title: "Block Builder", url: "/builder", icon: Layers },
  { titleKey: "sidebar.templates", title: "Templates", url: "/templates", icon: LayoutTemplate },
  { titleKey: "sidebar.myApps", title: "My Apps", url: "/deployments", icon: Rocket },
  { titleKey: "sidebar.forms", title: "Forms", url: "/forms", icon: ClipboardList },
  { titleKey: "sidebar.blog", title: "Blog & CMS", url: "/blog", icon: BookOpen },
  { titleKey: "sidebar.emailMarketing", title: "Email Marketing", url: "/email", icon: Mail },
  { titleKey: "sidebar.analytics", title: "Analytics", url: "/analytics", icon: BarChart3 },
  { titleKey: "sidebar.marketplace", title: "Marketplace", url: "/marketplace", icon: Store },
  { titleKey: "sidebar.pwa", title: "PWA Builder", url: "/pwa", icon: Smartphone },
  { titleKey: "sidebar.collaborate", title: "Collaborate", url: "/collaborate", icon: Users },
  { titleKey: "sidebar.domains", title: "Domain Store", url: "/domains?tab=search", icon: Globe },
  { titleKey: "sidebar.myDomains", title: "My Domains", url: "/domains?tab=mydomains", icon: Globe },
  { titleKey: "sidebar.integrations", title: "API Integrations", url: "/integrations", icon: Link2 },
  { titleKey: "sidebar.seo", title: "SEO Tools", url: "/seo", icon: Search },
  { titleKey: "sidebar.webhooks", title: "Webhooks", url: "/webhooks", icon: Zap },
  { titleKey: "sidebar.emailApi", title: "Email API", url: "/email-api", icon: Send },
  { titleKey: "sidebar.afroAuth", title: "Afro Auth", url: "/dashboard/auth", icon: KeyRound },
  { titleKey: "sidebar.chatbotApi", title: "Chatbot API", url: "/chatbots", icon: Bot },
  { titleKey: "sidebar.knowledge", title: "Knowledge", url: "/knowledge", icon: Brain },
  { titleKey: "sidebar.ussd", title: "USSD Builder", url: "/ussd", icon: PhoneCall },
  { titleKey: "sidebar.myUssd", title: "My USSD Apps", url: "/ussd/apps", icon: Smartphone },
  { titleKey: "sidebar.files", title: "Files & Storage", url: "/files", icon: HardDrive },
  { titleKey: "sidebar.secrets", title: "Secrets", url: "/secrets", icon: KeyRound },
  { titleKey: "sidebar.logs", title: "Activity Logs", url: "/logs", icon: Activity },
  { titleKey: "sidebar.console", title: "Console", url: "/console", icon: SquareTerminal },
  { titleKey: "sidebar.referrals", title: "Referrals", url: "/referrals", icon: Gift },
  { titleKey: "sidebar.pricing", title: "Pricing", url: "/pricing", icon: CreditCard },
  { titleKey: "sidebar.usageCredits", title: "Usage & Credits", url: "/billing", icon: Receipt },
  { titleKey: "sidebar.partnerPortal", title: "Partner Portal", url: "/partner-portal", icon: Handshake },
  { titleKey: "sidebar.becomePartner", title: "Become a Partner", url: "/become-partner", icon: Globe },
  { titleKey: "sidebar.settings", title: "Settings", url: "/settings", icon: Settings },
];

const FOUNDER_ITEMS = [
  { titleKey: "sidebar.founderDashboard", title: "Founder Dashboard", url: "/founder", icon: Crown },
  { titleKey: "sidebar.commandCenter", title: "Command Center", url: "/admin-command", icon: Terminal },
  { titleKey: "sidebar.keyoStudioRunner", title: "KEYO Studio runner studio", url: "/admin-command/keyo-studio", icon: Terminal },
  { titleKey: "sidebar.d1", title: "D1 Database", url: "/d1", icon: DatabaseZap },
];

type MenuItem = (typeof ALL_MENU_ITEMS)[number];

export const MENU_GROUPS = [
  { id: "builder", titleKey: "sidebar.aiBuilder", title: "AI Builder", icon: Layers, urls: ["/dashboard", "/media", "/builder", "/templates", "/deployments", "/forms", "/pwa"] },
  { id: "ussd", titleKey: "sidebar.groupUssd", title: "USSD", icon: PhoneCall, urls: ["/ussd", "/ussd/apps"] },
  { id: "domains", titleKey: "sidebar.groupDomains", title: "Domains", icon: Globe, urls: ["/domains?tab=search", "/domains?tab=mydomains"] },
  { id: "marketing", titleKey: "sidebar.groupMarketing", title: "Marketing & Content", icon: BarChart3, urls: ["/blog", "/email", "/analytics", "/seo"] },
  { id: "developer", titleKey: "sidebar.groupDeveloper", title: "Developer Tools", icon: Terminal, urls: ["/keyo-studio", "/playground", "/integrations", "/webhooks", "/email-api", "/dashboard/auth", "/chatbots", "/knowledge", "/files", "/secrets", "/console", "/logs"] },
  { id: "billing", titleKey: "sidebar.billing", title: "Billing & Usage", icon: Receipt, urls: ["/billing", "/pricing"] },
  { id: "partners", titleKey: "sidebar.groupPartners", title: "Partners & Referrals", icon: Handshake, urls: ["/become-partner", "/referrals", "/partner-portal"] },
];

// Segment boundaries and longest-path matching prevent parent links from
// becoming active alongside nested tools such as Afro Auth and My USSD Apps.
export function getActiveSidebarUrl(location: string, search: string, items: MenuItem[]) {
  const tab = new URLSearchParams(search).get("tab");
  return items
    .filter(item => {
      const [path, query] = item.url.split("?");
      if (location !== path && !location.startsWith(`${path}/`)) return false;
      if (!query) return true;
      return new URLSearchParams(query).get("tab") === (tab === "mydomains" ? "mydomains" : "search");
    })
    .sort((a, b) => b.url.split("?")[0].length - a.url.split("?")[0].length)[0]?.url;
}

const GROUP_STORAGE_KEY = "afro-sidebar-groups-v1";
function readOpenGroups(): Record<string, boolean> {
  try {
    const stored = JSON.parse(sessionStorage.getItem(GROUP_STORAGE_KEY) || "{}");
    return Object.fromEntries(MENU_GROUPS.map(group => [group.id, stored?.[group.id] === true]));
  } catch {
    return {};
  }
}

export function AppSidebar() {
  const [location] = useLocation();
  const routeSearch = useSearch();
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const firstName = user?.firstName || t("overview.defaultUser");
  const isFounder = (user as any)?.isFounder === true;
  const authorizedItems = isFounder ? [...ALL_MENU_ITEMS, ...FOUNDER_ITEMS] : ALL_MENU_ITEMS;
  const activeUrl = getActiveSidebarUrl(location, routeSearch, authorizedItems);
  const activeGroup = MENU_GROUPS.find(group => group.urls.includes(activeUrl || ""))?.id;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    ...readOpenGroups(),
    ...(activeGroup ? { [activeGroup]: true } : {}),
  }));
  const compact = state === "collapsed" && !isMobile;
  const query = search.trim().toLowerCase();
  const label = (item: { titleKey: string; title: string }) => {
    const value = t(item.titleKey);
    return value === item.titleKey ? item.title : value;
  };

  useEffect(() => {
    if (activeGroup) setOpenGroups(previous => ({ ...previous, [activeGroup]: true }));
  }, [location, routeSearch, activeGroup]);

  useEffect(() => {
    try { sessionStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(openGroups)); } catch { /* Storage may be disabled. */ }
  }, [openGroups]);

  const filteredItems = authorizedItems.filter(item =>
    label(item).toLowerCase().includes(query) || item.title.toLowerCase().includes(query)
  );
  const closeMobile = () => { if (isMobile) setOpenMobile(false); };
  const renderLeaf = (item: MenuItem) => (
    <SidebarMenuItem key={item.url} className={item.url === "/admin-command/keyo-studio" ? "pl-4" : undefined}>
      <SidebarMenuButton asChild isActive={activeUrl === item.url} tooltip={label(item)}>
        <Link
          href={item.url}
           onClick={event => {
             if (item.url === "/keyo-studio" && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
               event.preventDefault();
               window.location.assign(item.url);
             }
             if (item.url === "/chat" && requestNewChat()) event.preventDefault();
             closeMobile();
           }}
          aria-current={activeUrl === item.url ? "page" : undefined}
          title={label(item)}
          data-testid={`link-sidebar-${item.url.slice(1).replace("?tab=", "-")}`}
        >
          <item.icon className="w-4 h-4" />
          <span>{label(item)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 pb-2 group-data-[collapsible=icon]:p-2">
        <Link href="/chat" onClick={event => { if (requestNewChat()) event.preventDefault(); closeMobile(); }} aria-label="Afro AI">
          <div className="flex items-center gap-2 cursor-pointer mb-3" data-testid="link-sidebar-logo">
            <img src={afroLogo} alt="Afro AI" className="w-8 h-8 object-contain" />
             <span className="font-bold text-lg tracking-tight group-data-[collapsible=icon]:hidden">Afro AI</span>
          </div>
        </Link>
        <div className="relative group-data-[collapsible=icon]:hidden">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder={t("sidebar.searchPlaceholder")}
             aria-label={t("sidebar.searchPlaceholder")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-sidebar-search"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
           <SidebarGroupLabel>{query ? t("sidebar.results", { n: filteredItems.length }) : t("sidebar.menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {query ? (filteredItems.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">{t("sidebar.noMatches")}</p>
              ) : filteredItems.map(renderLeaf)) : (
                <>
                  {renderLeaf(ALL_MENU_ITEMS.find(item => item.url === "/chat")!)}
                  {MENU_GROUPS.map(group => (
                    <SidebarMenuItem key={group.id}>
                      <SidebarMenuButton
                        type="button"
                        tooltip={label(group)}
                        aria-label={label(group)}
                        aria-expanded={!!openGroups[group.id] && !compact}
                        aria-controls={`sidebar-group-${group.id}`}
                        isActive={activeGroup === group.id}
                        onClick={() => {
                          if (compact) {
                            setOpen(true);
                            setOpenGroups(previous => ({ ...previous, [group.id]: true }));
                          } else {
                            setOpenGroups(previous => ({ ...previous, [group.id]: !previous[group.id] }));
                          }
                        }}
                        data-testid={`button-sidebar-group-${group.id}`}
                      >
                        <group.icon className="w-4 h-4" />
                        <span className="flex-1">{label(group)}</span>
                        <ChevronDown aria-hidden="true" className={`ml-auto transition-transform group-data-[collapsible=icon]:hidden ${openGroups[group.id] ? "rotate-180" : ""}`} />
                      </SidebarMenuButton>
                      <div id={`sidebar-group-${group.id}`} hidden={!openGroups[group.id] || compact}>
                        <SidebarMenu className="ml-3 mt-1 w-auto border-l border-sidebar-border pl-2">
                          {group.urls.map(url => renderLeaf(ALL_MENU_ITEMS.find(item => item.url === url)!))}
                        </SidebarMenu>
                      </div>
                    </SidebarMenuItem>
                  ))}
                  {ALL_MENU_ITEMS.filter(item => ["/marketplace", "/collaborate", "/settings"].includes(item.url)).map(renderLeaf)}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isFounder && !query && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-primary">{t("sidebar.founder")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                 {FOUNDER_ITEMS.map(renderLeaf)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src={user?.profileImageUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {firstName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
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
          className="w-full justify-start group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:p-2"
          aria-label={t("sidebar.logout")}
          title={t("sidebar.logout")}
          onClick={() => logout()}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="group-data-[collapsible=icon]:hidden">{t("sidebar.logout")}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
