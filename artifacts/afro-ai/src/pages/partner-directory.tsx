import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, Mail, Phone, ExternalLink, MapPin, Crown, Award, Handshake, ArrowRight } from "lucide-react";
import type { Partner } from "@shared/schema";

const TIER_ICON: Record<string, any> = { authorized: Handshake, premium: Award, premier: Crown };
const TIER_COLOR: Record<string, string> = {
  authorized: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  premium: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  premier: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

export default function PartnerDirectoryPage() {
  const { data: partners, isLoading } = useQuery<Partner[]>({
    queryKey: ["/api/reseller/directory"],
  });

  // Group by country
  const byCountry: Record<string, Partner[]> = {};
  (partners || []).forEach(p => {
    const key = p.countryName || p.country;
    if (!byCountry[key]) byCountry[key] = [];
    byCountry[key].push(p);
  });
  const countries = Object.keys(byCountry).sort();

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <section className="text-center space-y-4">
          <Badge variant="outline" className="mx-auto">
            <Globe className="w-3 h-3 mr-1" /> Authorized Partners
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold font-serif" data-testid="text-directory-title">
            Find your local Afro AI partner
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Verified, certified companies authorized to sell, implement, train, and support Afro AI products in your country.
          </p>
          <div className="pt-2">
            <Link href="/become-partner">
              <Button variant="outline" data-testid="button-become-partner">
                Become a partner <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </section>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && countries.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center space-y-3">
              <Globe className="w-12 h-12 mx-auto text-muted-foreground/50" />
              <h3 className="font-semibold text-lg" data-testid="text-no-partners">No partners listed yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                We're actively recruiting authorized partners across Africa. Be the first in your country.
              </p>
              <Link href="/become-partner">
                <Button data-testid="button-apply-first">Apply to be the first partner in your country</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {!isLoading && countries.map(country => (
          <section key={country} className="space-y-4" data-testid={`section-country-${country}`}>
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">{country}</h2>
              <Badge variant="outline" className="text-xs">{byCountry[country].length} partner{byCountry[country].length === 1 ? "" : "s"}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {byCountry[country].map(p => {
                const Icon = TIER_ICON[p.tier] || Handshake;
                return (
                  <Card key={p.id} className="hover-elevate" data-testid={`card-partner-${p.id}`}>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {p.logoUrl ? (
                            <img src={p.logoUrl} alt={p.companyName} className="w-12 h-12 rounded-lg object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                              {p.companyName.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="font-semibold truncate" data-testid={`text-partner-name-${p.id}`}>{p.companyName}</h3>
                            {p.city && <p className="text-xs text-muted-foreground truncate">{p.city}, {p.countryName}</p>}
                          </div>
                        </div>
                        <Badge variant="outline" className={TIER_COLOR[p.tier]}>
                          <Icon className="w-3 h-3 mr-1" /> {p.tier}
                        </Badge>
                      </div>
                      {p.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">{p.description}</p>
                      )}
                      {p.services && p.services.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {p.services.slice(0, 4).map(s => (
                            <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 pt-2 border-t border-border/40">
                        <a href={`mailto:${p.contactEmail}`} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1" data-testid={`link-email-${p.id}`}>
                          <Mail className="w-3 h-3" /> {p.contactEmail}
                        </a>
                        {p.contactPhone && (
                          <a href={`tel:${p.contactPhone}`} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1" data-testid={`link-phone-${p.id}`}>
                            <Phone className="w-3 h-3" /> {p.contactPhone}
                          </a>
                        )}
                        {p.website && (
                          <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1" data-testid={`link-website-${p.id}`}>
                            <ExternalLink className="w-3 h-3" /> Website
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
