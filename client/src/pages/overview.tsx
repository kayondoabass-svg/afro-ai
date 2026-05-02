import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import {
  Globe, Eye, FolderOpen, FileImage, ClipboardList, Users,
  TrendingUp, Activity, ExternalLink, Rocket, ArrowRight,
  CheckCircle, XCircle, Clock, Zap, MessageSquare, PlayCircle,
} from "lucide-react";

interface RecentConvo {
  id: number;
  title: string;
  updatedAt: string;
  projectId?: number | null;
}

export default function OverviewPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const firstName = (user as any)?.firstName || "Creator";
  const plan = (user as any)?.plan || "starter";

  const { data: overview, isLoading } = useQuery<any>({
    queryKey: ["/api/overview"],
  });

  const { data: recentConvos } = useQuery<RecentConvo[]>({
    queryKey: ["/api/conversations"],
  });

  const statCards = [
    { label: "Published Apps", value: overview?.totalApps ?? 0, icon: Globe, color: "text-primary", sub: `${overview?.activeApps ?? 0} active`, link: "/deployments" },
    { label: "Total Views", value: overview?.totalViews ?? 0, icon: Eye, color: "text-blue-500", sub: "across all apps", link: "/analytics" },
    { label: "Projects", value: overview?.totalProjects ?? 0, icon: FolderOpen, color: "text-amber-500", sub: "in workspace", link: "/dashboard" },
    { label: "Files Uploaded", value: overview?.totalFiles ?? 0, icon: FileImage, color: "text-purple-500", sub: "images & videos", link: "/files" },
    { label: "Forms Created", value: overview?.totalForms ?? 0, icon: ClipboardList, color: "text-green-500", sub: `${overview?.totalSubmissions ?? 0} submissions`, link: "/forms" },
  ];

  const eventColors: Record<string, string> = {
    "app.published": "text-green-400",
    "app.updated": "text-blue-400",
    "secret.created": "text-amber-400",
    "form.submitted": "text-purple-400",
    "error": "text-red-400",
    "info": "text-gray-400",
  };

  const eventIcons: Record<string, any> = {
    "app.published": Rocket,
    "app.updated": Zap,
    "secret.created": CheckCircle,
    "form.submitted": ClipboardList,
    "error": XCircle,
    "info": Activity,
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, <span className="text-primary">{firstName}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Here's what's happening with your apps
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={plan === "starter" ? "secondary" : "default"} className="capitalize">
            {plan} plan
          </Badge>
          <Link href="/chat">
            <Button size="sm" data-testid="button-create-new-app">
              <Zap className="w-4 h-4 mr-1" /> Build New App
            </Button>
          </Link>
        </div>
      </div>

      {/* Resume Building — picks up the user's most recent in-progress chats */}
      {recentConvos && recentConvos.length > 0 && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent" data-testid="card-resume-building">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-primary" />
              {t("overview.resumeTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground -mt-1 mb-2">
              {t("overview.resumeSubtitle")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {recentConvos.slice(0, 6).map((convo) => (
                <Link key={convo.id} href={`/chat?conversation=${convo.id}`}>
                  <div className="p-3 rounded-md border bg-background/60 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer group" data-testid={`tile-resume-${convo.id}`}>
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{convo.title || t("overview.untitledChat")}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(convo.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <Link key={card.label} href={card.link}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer" data-testid={`card-stat-${card.label.toLowerCase().replace(/\s/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Apps */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Published Apps
            </CardTitle>
            <Link href="/deployments">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" data-testid="button-view-all-apps">
                View all <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : overview?.recentApps?.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No apps published yet.{" "}
                <Link href="/chat" className="text-primary hover:underline">Build your first app</Link>
              </div>
            ) : (
              overview?.recentApps?.map((app: any) => (
                <div key={app.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors" data-testid={`row-app-${app.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {app.appStatus === "active" ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{app.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{app.subdomain}.afroaigroup.com</p>
                    </div>
                  </div>
                  <a href={`https://${app.subdomain}.afroaigroup.com`} target="_blank" rel="noopener noreferrer" data-testid={`link-open-app-${app.id}`}>
                    <Button variant="ghost" size="icon" className="w-7 h-7">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Recent Activity
            </CardTitle>
            <Link href="/logs">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" data-testid="button-view-all-logs">
                View all <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : overview?.recentLogs?.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No recent activity yet.
              </div>
            ) : (
              overview?.recentLogs?.map((log: any) => {
                const Icon = eventIcons[log.eventType] || Activity;
                const color = eventColors[log.eventType] || "text-muted-foreground";
                return (
                  <div key={log.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors" data-testid={`row-log-${log.id}`}>
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{log.title}</p>
                      {log.description && <p className="text-xs text-muted-foreground truncate">{log.description}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "AI Builder", href: "/chat", icon: Zap, desc: "Create with AI" },
              { label: "Analytics", href: "/analytics", icon: TrendingUp, desc: "View stats" },
              { label: "Secrets", href: "/secrets", icon: CheckCircle, desc: "Manage env vars" },
              { label: "Activity Logs", href: "/logs", icon: Activity, desc: "See all events" },
            ].map((item) => (
              <Link key={item.label} href={item.href}>
                <div className="p-3 rounded-lg border hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer text-center" data-testid={`link-quick-${item.label.toLowerCase().replace(/\s/g, "-")}`}>
                  <item.icon className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
