import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Globe, CreditCard, BarChart3, Folder, Clock, ArrowRight } from "lucide-react";
import { africanCountries } from "@shared/currencies";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import type { Project } from "@shared/schema";

function useCountryPreference() {
  const [country, setCountry] = useState<string>(() => {
    return localStorage.getItem("afro-ai-country") || "";
  });

  const selectCountry = (isoCode: string) => {
    setCountry(isoCode);
    localStorage.setItem("afro-ai-country", isoCode);
  };

  return { country, selectCountry };
}

function getPlanLabel(plan: string) {
  switch (plan) {
    case "pro": return "Pro";
    case "business": return "Business";
    default: return "Starter (Free)";
  }
}

function getPlanVariant(plan: string): "default" | "secondary" | "outline" {
  switch (plan) {
    case "pro": return "default";
    case "business": return "default";
    default: return "secondary";
  }
}

export default function SettingsPage() {
  const { user, isLoading: userLoading } = useAuth();
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const { country, selectCountry } = useCountryPreference();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const selectedCountry = country ? africanCountries.find(c => c.isoCode === country) : null;
  const firstName = user?.firstName || "Creator";
  const lastName = user?.lastName || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const totalProjects = projects?.length ?? 0;
  const publishedProjects = projects?.filter(p => p.status === "published").length ?? 0;
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long" }) : "N/A";

  if (userLoading) {
    return (
      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Card><CardContent className="p-6 space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-4 w-40" /></CardContent></Card>
          <Card><CardContent className="p-6 space-y-4"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={user?.profileImageUrl || undefined} data-testid="img-avatar" />
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold" data-testid="text-avatar-fallback">
                  {firstName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate" data-testid="text-user-name">{fullName}</h2>
                <p className="text-sm text-muted-foreground truncate" data-testid="text-user-email">
                  {user?.email || "No email set"}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={getPlanVariant(user?.plan || "starter")} data-testid="badge-plan">
                    <CreditCard className="w-3 h-3 mr-1" />
                    {getPlanLabel(user?.plan || "starter")}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold">Current Plan</h3>
            </div>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm" data-testid="text-current-plan">
                  You are on the <span className="font-semibold">{getPlanLabel(user?.plan || "starter")}</span> plan.
                </p>
                {(user?.plan === "starter" || !user?.plan) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Upgrade to unlock custom domains, more storage, and priority support.
                  </p>
                )}
              </div>
              {(user?.plan === "starter" || !user?.plan) && (
                <Button
                  variant="outline"
                  onClick={() => navigate("/pricing")}
                  data-testid="button-upgrade-plan"
                >
                  Upgrade
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold">Country & Currency</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Select your country to see prices in your local currency.
            </p>
            <Select value={country} onValueChange={selectCountry}>
              <SelectTrigger className="w-full sm:w-[280px]" data-testid="select-settings-country">
                <SelectValue placeholder="Select your country" />
              </SelectTrigger>
              <SelectContent>
                {africanCountries.map((c) => (
                  <SelectItem key={c.isoCode} value={c.isoCode} data-testid={`option-settings-country-${c.isoCode}`}>
                    {c.name} ({c.currencyCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCountry && (
              <p className="text-xs text-muted-foreground" data-testid="text-selected-currency">
                Prices will be shown in {selectedCountry.currencyCode} ({selectedCountry.currencySymbol}).
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold">Account Stats</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-2xl font-bold" data-testid="text-stats-projects">{totalProjects}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Folder className="w-3 h-3" />
                  Total Projects
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold" data-testid="text-stats-published">{publishedProjects}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Published
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold" data-testid="text-stats-member-since">{memberSince}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Member Since
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}