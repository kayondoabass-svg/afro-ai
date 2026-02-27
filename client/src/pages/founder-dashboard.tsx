import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Folder,
  Globe,
  MessageSquare,
  MessagesSquare,
  Crown,
  TrendingUp,
  Activity,
  ExternalLink,
  Ban,
  CheckCircle,
} from "lucide-react";

interface PlatformStats {
  totalUsers: number;
  totalProjects: number;
  totalPublishedApps: number;
  totalConversations: number;
  totalMessages: number;
  recentUsers: any[];
  recentProjects: any[];
  recentPublishedApps: any[];
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-3xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FounderDashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isFounder = (user as any)?.isFounder === true;

  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/stats"],
    enabled: isFounder,
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      await apiRequest("POST", `/api/admin/published-apps/${id}/suspend`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      toast({ title: "App suspended", description: "The app is now offline." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to suspend app", variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/published-apps/${id}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      toast({ title: "App reactivated", description: "The app is back online." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to reactivate app", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!isFounder) setLocation("/dashboard");
  }, [isFounder, setLocation]);

  if (!isFounder) return null;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Crown className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-founder-title">Founder Dashboard</h1>
            <p className="text-sm text-muted-foreground">Complete platform overview & analytics</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Users} label="Total Users" value={stats?.totalUsers ?? 0} color="bg-blue-500/10 text-blue-500" />
          <StatCard icon={Folder} label="Total Projects" value={stats?.totalProjects ?? 0} color="bg-primary/10 text-primary" />
          <StatCard icon={Globe} label="Published Apps" value={stats?.totalPublishedApps ?? 0} color="bg-green-500/10 text-green-500" />
          <StatCard icon={MessagesSquare} label="Conversations" value={stats?.totalConversations ?? 0} color="bg-purple-500/10 text-purple-500" />
          <StatCard icon={MessageSquare} label="AI Messages" value={stats?.totalMessages ?? 0} color="bg-orange-500/10 text-orange-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-4 border-b">
                <Users className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold text-sm">Recent Users</h3>
                <Badge variant="secondary" className="ml-auto text-xs">{stats?.totalUsers ?? 0}</Badge>
              </div>
              <ScrollArea className="h-[320px]">
                <div className="p-2 space-y-1">
                  {stats?.recentUsers && stats.recentUsers.length > 0 ? (
                    stats.recentUsers.map((u: any) => (
                      <div key={u.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`admin-user-${u.id}`}>
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={u.profileImageUrl || undefined} />
                          <AvatarFallback className="bg-blue-500/10 text-blue-500 text-xs">
                            {(u.firstName || "?").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.firstName} {u.lastName}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0">{u.plan || "starter"}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No users yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-4 border-b">
                <Folder className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Recent Projects</h3>
                <Badge variant="secondary" className="ml-auto text-xs">{stats?.totalProjects ?? 0}</Badge>
              </div>
              <ScrollArea className="h-[320px]">
                <div className="p-2 space-y-1">
                  {stats?.recentProjects && stats.recentProjects.length > 0 ? (
                    stats.recentProjects.map((p: any) => (
                      <div key={p.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`admin-project-${p.id}`}>
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Folder className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">By: {p.userId?.slice(0, 8)}...</p>
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0">{p.status}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No projects yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-4 border-b">
                <Globe className="w-4 h-4 text-green-500" />
                <h3 className="font-semibold text-sm">Published Apps</h3>
                <Badge variant="secondary" className="ml-auto text-xs">{stats?.totalPublishedApps ?? 0}</Badge>
              </div>
              <ScrollArea className="h-[320px]">
                <div className="p-2 space-y-1">
                  {stats?.recentPublishedApps && stats.recentPublishedApps.length > 0 ? (
                    stats.recentPublishedApps.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`admin-app-${a.id}`}>
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${a.appStatus === "suspended" ? "bg-red-500/10" : "bg-green-500/10"}`}>
                          <Globe className={`w-4 h-4 ${a.appStatus === "suspended" ? "text-red-500" : "text-green-500"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{a.title}</p>
                            {a.appStatus === "suspended" && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Suspended</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{a.subdomain}.afroaigroup.com</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {a.appStatus === "suspended" ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                              onClick={() => reactivateMutation.mutate(a.id)}
                              disabled={reactivateMutation.isPending}
                              title="Reactivate app"
                              data-testid={`button-reactivate-${a.id}`}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={() => suspendMutation.mutate({ id: a.id, reason: "Suspended by administrator" })}
                              disabled={suspendMutation.isPending}
                              title="Suspend app"
                              data-testid={`button-suspend-${a.id}`}
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          )}
                          <a
                            href={`/site/${a.subdomain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No published apps yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Platform Health</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">Avg Messages/Conversation</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-avg-messages">
                  {stats && stats.totalConversations > 0
                    ? (stats.totalMessages / stats.totalConversations).toFixed(1)
                    : "0"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Avg Projects/User</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-avg-projects">
                  {stats && stats.totalUsers > 0
                    ? (stats.totalProjects / stats.totalUsers).toFixed(1)
                    : "0"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">Publish Rate</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-publish-rate">
                  {stats && stats.totalProjects > 0
                    ? ((stats.totalPublishedApps / stats.totalProjects) * 100).toFixed(0) + "%"
                    : "0%"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
