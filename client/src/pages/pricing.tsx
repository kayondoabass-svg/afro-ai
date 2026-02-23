import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/use-language";
import { Check, Rocket } from "lucide-react";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function PricingPage() {
  const { t } = useLanguage();

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="text-center space-y-4">
          <Badge variant="outline" className="mx-auto">
            <Rocket className="w-3 h-3 mr-1" />
            {t("pricing.badge")}
          </Badge>
          <h1 className="text-3xl font-bold font-serif" data-testid="text-pricing-title">
            {t("pricingPage.title")}
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            {t("pricingPage.subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="hover-elevate">
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold">{t("pricing.starter")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.starter.desc")}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{t("pricing.free")}</span>
              </div>
              <div className="space-y-3">
                {[t("pricing.starter.f1"), t("pricing.starter.f2"), t("pricing.starter.f3"), t("pricing.starter.f4")].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button variant="secondary" className="w-full" data-testid="button-current-plan">
                {t("pricingPage.currentPlan")}
              </Button>
            </CardContent>
          </Card>

          <Card className="hover-elevate ring-2 ring-primary relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-primary text-primary-foreground">{t("pricing.mostPopular")}</Badge>
            </div>
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold">{t("pricing.pro")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.pro.desc")}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{t("pricing.pro.price")}</span>
                <span className="text-muted-foreground">{t("pricing.perMonth")}</span>
              </div>
              <div className="space-y-3">
                {[t("pricing.pro.f1"), t("pricing.pro.f2"), t("pricing.pro.f3"), t("pricing.pro.f4"), t("pricing.pro.f5"), t("pricingPage.pro.f6")].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full" disabled data-testid="button-pro-plan">
                <img src={afroLogo} alt="" className="w-4 h-4 object-contain" />
                {t("pricing.comingSoon")}
              </Button>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold">{t("pricing.business")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.business.desc")}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{t("pricing.business.price")}</span>
                <span className="text-muted-foreground">{t("pricing.perMonth")}</span>
              </div>
              <div className="space-y-3">
                {[t("pricing.business.f1"), t("pricing.business.f2"), t("pricing.business.f3"), t("pricing.business.f4"), t("pricing.business.f5"), t("pricing.business.f6"), t("pricingPage.business.f7")].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full" disabled data-testid="button-business-plan">
                {t("pricing.comingSoon")}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <img src={afroLogo} alt="Afro AI" className="w-8 h-8 object-contain" />
            </div>
            <h3 className="text-lg font-semibold">{t("pricingPage.flutterwaveTitle")}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t("pricingPage.flutterwaveDesc")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
