import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Eye, TrendingUp, Globe, Calendar, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ViewData {
  app: {
    id: number;
    appName: string;
    subdomain: string;
    appStatus: string;
    createdAt: string;
  };
  views: { viewDate: string; views: number }[];
}

function MiniBarChart({ data }: { data: { date: string; views: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-end gap-0.5 h-16 mt-2">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="flex-1 bg-white/5 rounded-sm min-h-[4px]" />
        ))}
      </div>
    );
  }
  const last14 = [...data].slice(-14);
  const maxViews = Math.max(...last14.map(d => d.views), 1);
  return (
    <div className="flex items-end gap-0.5 h-16 mt-2">
      {last14.map((d, i) => {
        const pct = (d.views / maxViews) * 100;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-300 relative group"
            style={{ height: `${Math.max(pct, 4)}%`, background: "linear-gradient(to top, #d4af37, #f0d060)" }}
          >
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black border border-white/10 rounded px-1.5 py-0.5 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
              {d.views} views<br />{d.date}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const [selectedApp, setSelectedApp] = useState<number | null>(null);

  const { data: analyticsData, isLoading } = useQuery<ViewData[]>({
    queryKey: ["/api/analytics"],
  });

  const totalViews = analyticsData?.reduce((sum, a) => sum + a.views.reduce((s, v) => s + v.views, 0), 0) || 0;
  const totalApps = analyticsData?.length || 0;
  const topApp = analyticsData?.sort((a, b) => {
    const aTotal = a.views.reduce((s, v) => s + v.views, 0);
    const bTotal = b.views.reduce((s, v) => s + v.views, 0);
    return bTotal - aTotal;
  })[0];

  const selected = analyticsData?.find(a => a.app.id === selectedApp);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-yellow-400" />
            Analytics
          </h1>
          <p className="text-muted-foreground mt-1">Track visitors and performance for your published apps</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Views</p>
                  <p className="text-3xl font-bold text-yellow-400 mt-1" data-testid="text-total-views">{totalViews.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-yellow-400/10 flex items-center justify-center">
                  <Eye className="w-6 h-6 text-yellow-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Published Apps</p>
                  <p className="text-3xl font-bold text-blue-400 mt-1" data-testid="text-total-apps">{totalApps}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-400/10 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Top Performer</p>
                  <p className="text-lg font-bold text-green-400 mt-1 truncate max-w-[160px]" data-testid="text-top-app">
                    {topApp ? topApp.app.appName || topApp.app.subdomain : "—"}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-green-400/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <Card key={i} className="border-white/10 bg-white/5 animate-pulse">
                <CardContent className="pt-5 h-40" />
              </Card>
            ))}
          </div>
        ) : analyticsData && analyticsData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analyticsData.map(({ app, views }) => {
              const totalAppViews = views.reduce((s, v) => s + v.views, 0);
              const isSelected = selectedApp === app.id;
              return (
                <Card
                  key={app.id}
                  data-testid={`card-analytics-${app.id}`}
                  className={`border transition-all duration-200 cursor-pointer ${isSelected ? "border-yellow-400/50 bg-yellow-400/5" : "border-white/10 bg-white/5 hover:border-white/20"}`}
                  onClick={() => setSelectedApp(isSelected ? null : app.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold truncate">
                        {app.appName || app.subdomain}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs ${app.appStatus === "active" ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"}`}>
                          {app.appStatus}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7"
                          data-testid={`button-view-app-${app.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/site/${app.subdomain}`, "_blank");
                          }}
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{app.subdomain}.afroaigroup.com</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="w-4 h-4 text-yellow-400" />
                      <span className="text-xl font-bold text-yellow-400">{totalAppViews.toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground">total views</span>
                    </div>
                    <MiniBarChart data={views.map(v => ({ date: v.viewDate, views: v.views }))} />
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Last 14 days
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-white/10 bg-white/5">
            <CardContent className="py-16 text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No analytics yet</h3>
              <p className="text-muted-foreground text-sm">Publish an app to start tracking visitors. Views are recorded automatically each time someone visits your published app.</p>
            </CardContent>
          </Card>
        )}

        <Card className="border-white/10 bg-white/5">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h3 className="font-medium text-sm mb-1">How analytics work</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Every time someone visits your published app at <code className="bg-white/10 px-1 rounded text-xs">{"{name}"}.afroaigroup.com</code>, a view is recorded.
                  The bar charts show the last 14 days of daily traffic. Analytics are tracked server-side — no scripts needed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
