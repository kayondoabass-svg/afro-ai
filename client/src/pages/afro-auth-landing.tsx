import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Code2, Globe2, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const TIERS = [
  {
    name: "Starter",
    price: "Free",
    sub: "forever",
    mau: "5,000",
    features: ["Email + password login", "Hosted JSON API", "Basic dashboard", "Community support"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Builder",
    price: "$5",
    sub: "/ month",
    mau: "25,000",
    features: ["Everything in Starter", "Custom branding", "Email support", "1 production app"],
    cta: "Choose Builder",
    highlight: true,
  },
  {
    name: "Business",
    price: "$25",
    sub: "/ month",
    mau: "100,000",
    features: ["Up to 5 apps", "SMS OTP (African telcos)", "Priority email support", "Webhook events"],
    cta: "Choose Business",
    highlight: false,
  },
  {
    name: "Scale",
    price: "$100",
    sub: "/ month",
    mau: "500,000",
    features: ["Unlimited apps", "Dedicated success manager", "99.9% SLA", "Custom contracts"],
    cta: "Talk to us",
    highlight: false,
  },
];

const COMPETITORS = [
  { name: "Auth0", price: "from $35/mo (500 MAUs)" },
  { name: "Clerk", price: "from $25/mo (10k MAUs)" },
  { name: "Frontegg", price: "from $99/mo" },
  { name: "Afro Auth", price: "from $5/mo (25k MAUs)", us: true },
];

export default function AfroAuthLandingPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const ctaHref = user ? "/dashboard/auth" : "/login?redirect=/dashboard/auth";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <Badge className="mb-4" variant="secondary" data-testid="badge-built-in-africa">
            Built in Africa, for African builders
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4" data-testid="text-hero-title">
            Afro Auth
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-8" data-testid="text-hero-tagline">
            Drop-in login for your app. Email, password, OAuth — and pay in mobile money.
            Auth0-grade quality from <span className="font-semibold text-foreground">$5/month</span>.
          </p>
          <div className="flex flex-wrap gap-3 justify-center" data-testid="container-hero-cta">
            <Button
              size="lg"
              onClick={() => setLocation(ctaHref)}
              disabled={isLoading}
              data-testid="button-get-started"
            >
              Get started free
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                const el = document.getElementById("pricing");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              data-testid="button-see-pricing"
            >
              See pricing
            </Button>
          </div>
        </div>
      </section>

      {/* Why Afro Auth */}
      <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
        <FeatureCard
          icon={<Zap className="h-6 w-6" />}
          title="Ship login in 10 minutes"
          body="Two API calls. We handle password hashing, captcha, sessions, and security."
          testId="card-feature-fast"
        />
        <FeatureCard
          icon={<Globe2 className="h-6 w-6" />}
          title="Pay in mobile money"
          body="MTN, Airtel, M-Pesa via Pesapal. No US credit card required — finally."
          testId="card-feature-mm"
        />
        <FeatureCard
          icon={<Smartphone className="h-6 w-6" />}
          title="Future: SMS + USSD"
          body="OTP via local telcos and login from feature phones. Things Auth0 won't ever build."
          testId="card-feature-future"
        />
      </section>

      {/* Code snippet */}
      <section className="bg-muted/30 border-y">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2" data-testid="text-code-section-title">
              Plug it into your app
            </h2>
            <p className="text-muted-foreground">A signup endpoint takes one fetch call.</p>
          </div>
          <pre
            className="bg-card border rounded-lg p-6 overflow-x-auto text-sm font-mono"
            data-testid="code-snippet"
          >
{`// In your app, point your signup form here:
const res = await fetch(
  "https://afroaigroup.com/cf-auth/t/your-app-slug/signup",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }
);
const { token, user } = await res.json();
// Store \`token\` (localStorage / cookie) and you're done.`}
          </pre>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-2" data-testid="text-pricing-title">
            Honest, African-friendly pricing
          </h2>
          <p className="text-muted-foreground">
            All plans include captcha, password reset, and 30-day sessions.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((tier) => (
            <Card
              key={tier.name}
              className={tier.highlight ? "border-primary border-2 shadow-lg" : ""}
              data-testid={`card-tier-${tier.name.toLowerCase()}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle data-testid={`text-tier-name-${tier.name.toLowerCase()}`}>{tier.name}</CardTitle>
                  {tier.highlight && (
                    <Badge data-testid={`badge-popular-${tier.name.toLowerCase()}`}>Popular</Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-bold" data-testid={`text-tier-price-${tier.name.toLowerCase()}`}>
                    {tier.price}
                  </span>
                  <span className="text-muted-foreground">{tier.sub}</span>
                </div>
                <CardDescription data-testid={`text-tier-mau-${tier.name.toLowerCase()}`}>
                  Up to <strong>{tier.mau}</strong> monthly active users
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={tier.highlight ? "default" : "outline"}
                  onClick={() => setLocation(ctaHref)}
                  data-testid={`button-tier-cta-${tier.name.toLowerCase()}`}
                >
                  {tier.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="bg-muted/30 border-t">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center" data-testid="text-comparison-title">
            How we compare
          </h2>
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">Service</th>
                    <th className="text-right p-4 font-medium">Cheapest paid plan</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPETITORS.map((c) => (
                    <tr
                      key={c.name}
                      className={c.us ? "bg-primary/10 font-semibold" : "border-b last:border-0"}
                      data-testid={`row-competitor-${c.name.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <td className="p-4">{c.name}{c.us ? " (us)" : ""}</td>
                      <td className="p-4 text-right">{c.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <ShieldCheck className="h-12 w-12 mx-auto text-primary mb-4" />
        <h2 className="text-3xl font-bold mb-2" data-testid="text-final-cta-title">
          Stop building login from scratch.
        </h2>
        <p className="text-muted-foreground mb-6">
          Set up your first project in under 5 minutes. Free tier, no card.
        </p>
        <Button size="lg" onClick={() => setLocation(ctaHref)} data-testid="button-final-cta">
          Create your project
        </Button>
      </section>
    </div>
  );
}

function FeatureCard({
  icon, title, body, testId,
}: { icon: React.ReactNode; title: string; body: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <div className="text-primary mb-3">{icon}</div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
